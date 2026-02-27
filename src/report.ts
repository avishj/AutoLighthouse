import * as core from "@actions/core";
import * as github from "@actions/github";
import { parseConfig } from "./config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { discoverArtifacts, parseLhr, extractMetrics, extractUrl, validateResultsPath } from "./lhr";
import { detectRegressions } from "./regression";
import { loadHistory, saveHistory, cleanupStalePaths, validateHistoryPath } from "./history";
import { manageIssue } from "./issues";
import { buildSummary } from "./summary";
import { isPathSafe } from "./utils";
import type {
  Profile,
  Metrics,
  AssertionResult,
  Regression,
  ProfileResult,
  UrlResult,
  AnalysisResult,
} from "./types";
import { METRIC_KEYS } from "./types";

async function run(): Promise<void> {
  try {
    const config = parseConfig();
    
    const workspace = process.env.GITHUB_WORKSPACE || ".";
    const safeResultsPath = validateResultsPath(config.resultsPath, workspace);
    if (safeResultsPath === null) {
      // Distinguish missing directory (no artifacts downloaded) from path traversal
      if (isPathSafe(config.resultsPath) && !existsSync(resolve(workspace, config.resultsPath))) {
        core.warning("Results directory does not exist — no audit artifacts were downloaded.");
        return;
      }
      core.setFailed("Invalid results path: path traversal detected.");
      return;
    }
    
    const artifacts = discoverArtifacts(safeResultsPath);

    if (artifacts.length === 0) {
      core.warning("No audit artifacts found — nothing to analyze.");
      return;
    }

    const historyPath = config.historyPath 
      ? validateHistoryPath(config.historyPath, workspace)
      : null;
    if (config.historyPath && !historyPath) {
      core.warning("Invalid history path: path traversal detected. History disabled.");
    }
    
    const history = historyPath ? loadHistory(historyPath) : null;

    // Collect raw per-profile×URL data
    const raw: Array<{
      profile: Profile;
      url: string;
      pathname: string;
      metrics: Metrics;
      runMetrics: Metrics[];
      assertions: AssertionResult[];
      reportLink?: string;
    }> = [];

    for (const artifact of artifacts) {
      const failedAssertions = artifact.assertions.filter((a) => !a.passed);

      // Group LHR files by URL to deduplicate multiple runs per profile+URL
      const lhrsByUrl = new Map<string, { pathname: string; allMetrics: Metrics[] }>();

      for (const lhrPath of artifact.lhrPaths) {
        const lhr = parseLhr(lhrPath);
        if (!lhr) continue;

        const url = extractUrl(lhr);
        if (!url) continue;

        const metrics = extractMetrics(lhr);
        let entry = lhrsByUrl.get(url);
        if (!entry) {
          entry = { pathname: extractPathname(url), allMetrics: [] };
          lhrsByUrl.set(url, entry);
        }
        entry.allMetrics.push(metrics);
      }

      for (const [url, { pathname, allMetrics }] of lhrsByUrl) {
        const metrics = medianMetrics(allMetrics);
        const urlAssertions = failedAssertions.filter((a) => !a.url || a.url === url);
        const reportLink = artifact.links[url] ?? undefined;

        raw.push({ profile: artifact.profile, url, pathname, metrics, runMetrics: allMetrics, assertions: urlAssertions, reportLink });
      }
    }

    // Group by URL, nest profiles under each URL
    const urlMap = new Map<string, { url: string; pathname: string; profiles: ProfileResult[] }>();
    const activeKeys = new Set<string>();
    const allRegressions: AnalysisResult["allRegressions"] = [];

    for (const r of raw) {
      const historyKey = `${r.profile}:${r.pathname}`;
      activeKeys.add(historyKey);

      const entry = history?.paths[historyKey];
      const regressions = history ? detectRegressions(r.metrics, entry, config.regressionThreshold) : [];

      const consecutiveFailures = entry?.consecutiveFailures ?? 0;
      const hasFailed = regressions.length > 0 || r.assertions.length > 0;
      const newConsecutive = hasFailed ? consecutiveFailures + 1 : 0;

      // Update history entry
      if (history) {
        const now = new Date().toISOString();
        if (!history.paths[historyKey]) {
          history.paths[historyKey] = { consecutiveFailures: 0, lastSeen: now, runs: [] };
        }
        history.paths[historyKey].consecutiveFailures = newConsecutive;
        history.paths[historyKey].lastSeen = now;
        history.paths[historyKey].runs.push({ metrics: r.metrics, timestamp: now });
      }

      if (regressions.length > 0) {
        allRegressions.push({ url: r.url, profile: r.profile, regressions });
      }

      const profileResult: ProfileResult = {
        profile: r.profile,
        metrics: r.metrics,
        runMetrics: r.runMetrics,
        regressions,
        assertions: r.assertions,
        consecutiveFailures: newConsecutive,
        passed: !hasFailed,
        reportLink: r.reportLink,
      };

      let urlEntry = urlMap.get(r.url);
      if (!urlEntry) {
        urlEntry = { url: r.url, pathname: r.pathname, profiles: [] };
        urlMap.set(r.url, urlEntry);
      }
      urlEntry.profiles.push(profileResult);
    }

    const urls: UrlResult[] = Array.from(urlMap.values()).map((u) => ({
      ...u,
      passed: u.profiles.every((p) => p.passed),
    }));

    const analysis: AnalysisResult = {
      urls,
      allRegressions,
      hasRegressions: allRegressions.length > 0,
      passed: urls.every((u) => u.passed),
    };

    // Save history
    if (history && historyPath) {
      if (config.cleanupStalePaths) {
        const removed = cleanupStalePaths(history, activeKeys, config.stalePathDays);
        if (removed.length > 0) {
          core.info(`Cleaned up ${removed.length} stale history path(s): ${removed.join(", ")}`);
        }
      }
      try {
        await saveHistory(historyPath, history, config.maxHistoryRuns);
        core.info(`History saved to ${historyPath}`);
      } catch (err) {
        core.warning(`Failed to save history: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Issue management
    if (config.createIssues && config.githubToken) {
      try {
        const octokit = github.getOctokit(config.githubToken);
        await manageIssue(octokit, analysis, config.consecutiveFailLimit);
      } catch (err) {
        core.warning(`Issue management failed: ${err instanceof Error ? err.message : err}`);
      }
    } else if (config.createIssues && !config.githubToken) {
      core.warning("Issue management skipped — no github-token provided.");
    }

    // Step summary
    const summary = buildSummary(analysis);
    await core.summary.addRaw(summary).write();

    // Set outputs
    core.setOutput("results", JSON.stringify(analysis.urls));
    core.setOutput("regressions", JSON.stringify(analysis.allRegressions));
    core.setOutput("has-regressions", String(analysis.hasRegressions));

    // Fail-on logic
    if (config.failOn !== "never") {
      const hasErrors = raw.some((r) => r.assertions.some((a) => a.level === "error"));
      const hasWarns = raw.some((r) => r.assertions.some((a) => a.level === "warn"));

      if (config.failOn === "error" && hasErrors) {
        core.setFailed("Lighthouse assertion errors detected.");
      } else if (config.failOn === "warn" && (hasErrors || hasWarns)) {
        core.setFailed("Lighthouse assertion failures detected.");
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

/** Pick the median value for each metric across multiple LHR runs. */
function medianMetrics(allMetrics: Metrics[]): Metrics {
  if (allMetrics.length === 1) return allMetrics[0];
  const result = {} as Metrics;
  for (const key of METRIC_KEYS) {
    const values = allMetrics
      .map((m) => m[key])
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    result[key] = values.length > 0 ? values[Math.floor(values.length / 2)] : undefined;
  }
  return result;
}

function extractPathname(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch (err) {
    return "/";
  }
}

run();
