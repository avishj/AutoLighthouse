import * as github from "@actions/github";
import type { AnalysisResult, ProfileResult, Metrics, MetricKey } from "./types";
import { METRIC_KEYS, METRIC_DISPLAY_NAMES, METRIC_SHORT_NAMES } from "./types";
import { filterFailedAssertions, countAssertionLevels, buildRegressionsList, fmtMetricValue } from "./utils";

const ISSUE_TITLE = "Lighthouse Performance Alert";
const LABELS = ["lighthouse", "performance"];

type Octokit = ReturnType<typeof github.getOctokit>;

function getRepo() {
  return github.context.repo;
}

/** Create labels if they don't already exist. */
export async function ensureLabels(octokit: Octokit): Promise<string[]> {
  const { owner, repo } = getRepo();
  const ensured: string[] = [];

  for (const label of LABELS) {
    try {
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label,
        color: "D93F0B",
      });
      ensured.push(label);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 422) {
        ensured.push(label);
      }
    }
  }

  return ensured;
}

/** Build consolidated issue body — summary → URLs → profiles → individual runs. */
export function buildIssueBody(
  analysis: AnalysisResult,
  consecutiveFailLimit: number,
): string {
  const timestamp = new Date().toISOString();
  const branch = process.env.GITHUB_REF?.replace("refs/heads/", "") ?? "unknown";
  const commit = process.env.GITHUB_SHA?.substring(0, 7) ?? "unknown";

  const failedUrls = analysis.urls.filter((u) => !u.passed);
  const failingProfiles = failedUrls.flatMap((u) => u.profiles.filter((p) => !p.passed));
  const totalProfiles = analysis.urls.reduce((s, u) => s + u.profiles.length, 0);
  const totalErrors = failingProfiles.reduce(
    (s, p) => s + countAssertionLevels(filterFailedAssertions(p.assertions)).errors, 0,
  );
  const totalWarnings = failingProfiles.reduce(
    (s, p) => s + countAssertionLevels(filterFailedAssertions(p.assertions)).warnings, 0,
  );
  const totalRegressions = failingProfiles.reduce((s, p) => s + p.regressions.length, 0);

  // ── Header ──────────────────────────────────────────────────────────
  let body = `## 🔴 Lighthouse Performance Alert\n\n`;

  const parts: string[] = [];
  if (totalErrors > 0) parts.push(`${totalErrors} error${pl(totalErrors)}`);
  if (totalWarnings > 0) parts.push(`${totalWarnings} warning${pl(totalWarnings)}`);
  if (totalRegressions > 0) parts.push(`${totalRegressions} regression${pl(totalRegressions)}`);

  body += `> **${analysis.urls.length} URL${pl(analysis.urls.length)}** across `;
  body += `**${totalProfiles} profile${pl(totalProfiles)}** — `;
  body += `**${failingProfiles.length} failing** · ${parts.join(" · ")}\n\n`;

  // ── Status matrix ───────────────────────────────────────────────────
  body += buildStatusMatrix(analysis);

  // ── Metadata ────────────────────────────────────────────────────────
  body += `\`${branch}\` · \`${commit}\` · ${fmtDate(timestamp)}\n\n`;
  body += `---\n\n`;

  // ── Per-URL sections ────────────────────────────────────────────────
  for (const url of analysis.urls) {
    if (url.passed) continue;

    body += `### ${url.pathname}\n\n`;

    for (const pr of url.profiles) {
      if (pr.passed) continue;

      body += buildProfileSection(pr, consecutiveFailLimit);
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────
  body += `---\n\n`;
  const runCount = failingProfiles[0]?.runMetrics?.length;
  body += `<sub>🤖 Auto-managed by AutoLighthouse`;
  if (runCount && runCount > 1) body += ` · ${runCount} runs per profile`;
  body += `</sub>`;

  return body;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function pl(n: number): string { return n !== 1 ? "s" : ""; }

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${hh}:${mm} UTC`;
}

function profileStatusIcon(pr: ProfileResult): string {
  const failures = filterFailedAssertions(pr.assertions);
  const { errors } = countAssertionLevels(failures);
  if (errors > 0) return "🔴";
  if (failures.length > 0) return "🟡";
  if (pr.regressions.length > 0) return "📉";
  return "🟢";
}

function buildStatusMatrix(analysis: AnalysisResult): string {
  const profileSet = new Set<string>();
  for (const url of analysis.urls) {
    for (const p of url.profiles) profileSet.add(p.profile);
  }
  const profiles = Array.from(profileSet);
  if (profiles.length === 0) return "";

  const icons: Record<string, string> = { desktop: "🖥️", mobile: "📱", tablet: "📱" };

  let md = `| URL |`;
  for (const p of profiles) md += ` ${icons[p] ?? ""} ${p} |`;
  md += `\n|-----|`;
  for (const _ of profiles) md += `:---:|`;
  md += `\n`;

  for (const url of analysis.urls) {
    md += `| \`${url.pathname}\` |`;
    for (const name of profiles) {
      const pr = url.profiles.find((p) => p.profile === name);
      if (!pr) { md += ` — |`; continue; }
      md += ` ${profileStatusIcon(pr)} |`;
    }
    md += `\n`;
  }
  md += `\n`;
  return md;
}

function buildProfileSection(pr: ProfileResult, consecutiveFailLimit: number): string {
  const icon = profileStatusIcon(pr);
  let md = `<details open>\n<summary><b>${icon} ${pr.profile}</b>`;

  const failures = filterFailedAssertions(pr.assertions);
  if (failures.length > 0) {
    const { errors, warnings } = countAssertionLevels(failures);
    const counts: string[] = [];
    if (errors > 0) counts.push(`${errors} error${pl(errors)}`);
    if (warnings > 0) counts.push(`${warnings} warning${pl(warnings)}`);
    md += ` · ${counts.join(", ")}`;
  }
  if (pr.regressions.length > 0) {
    md += ` · ${pr.regressions.length} regression${pl(pr.regressions.length)}`;
  }
  if (pr.reportLink) {
    md += ` · <a href="${pr.reportLink}">View Report ↗</a>`;
  }
  md += `</summary>\n\n`;

  // Assertion failures
  if (failures.length > 0) {
    md += `**Assertion Failures**\n\n`;
    md += `| Audit | Level | Actual | Threshold |\n`;
    md += `|-------|-------|--------|----------|\n`;
    for (const a of failures) {
      const lvl = a.level === "error" ? "🔴 error" : "🟡 warn";
      md += `| ${a.auditId} | ${lvl} | ${a.actual ?? "—"} | ${a.operator ?? ""} ${a.expected ?? "—"} |\n`;
    }
    md += "\n";
  }

  // Regressions
  if (pr.regressions.length > 0) {
    md += buildRegressionsList(pr.regressions);
  }

  // Core Web Vitals
  const runs = pr.runMetrics;
  if (runs && runs.length > 0) {
    md += buildMetricsTable(pr.metrics, runs);
  }

  // Persistent failure
  if (pr.consecutiveFailures >= consecutiveFailLimit) {
    md += `> ⚠️ **Persistent failure** — ${pr.consecutiveFailures} consecutive runs\n\n`;
  }

  md += `</details>\n\n`;
  return md;
}

function buildMetricsTable(median: Metrics, runs: Metrics[]): string {
  let md = `**Core Web Vitals** _(median of ${runs.length} run${pl(runs.length)})_\n\n`;
  md += `| Metric | Median | Range |\n`;
  md += `|--------|-------:|------:|\n`;

  for (const key of METRIC_KEYS) {
    const medVal = median[key];
    if (medVal === undefined) continue;
    const sorted = runs.map((r) => r[key]).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
    if (sorted.length === 0) continue;
    const range = `${fmtMetricValue(key, sorted[0])} – ${fmtMetricValue(key, sorted[sorted.length - 1])}`;
    md += `| ${METRIC_DISPLAY_NAMES[key]} | ${fmtMetricValue(key, medVal)} | ${range} |\n`;
  }
  md += "\n";

  // Individual runs (collapsible)
  if (runs.length > 1) {
    md += `<details>\n<summary>📊 Individual runs (${runs.length})</summary>\n\n`;
    md += `| # |`;
    for (const key of METRIC_KEYS) md += ` ${METRIC_SHORT_NAMES[key]} |`;
    md += `\n|---|`;
    for (const _ of METRIC_KEYS) md += `---:|`;
    md += `\n`;
    for (let i = 0; i < runs.length; i++) {
      md += `| ${i + 1} |`;
      for (const key of METRIC_KEYS) {
        const v = runs[i][key];
        md += ` ${v !== undefined ? fmtMetricValue(key, v) : "—"} |`;
      }
      md += `\n`;
    }
    md += `\n</details>\n\n`;
  }

  return md;
}

/** Create, comment on, or close the Lighthouse Performance Alert issue. */
export async function manageIssue(
  octokit: Octokit,
  analysis: AnalysisResult,
  consecutiveFailLimit: number,
): Promise<void> {
  const existingIssue = await findOpenIssue(octokit);

  if (!analysis.passed) {
    const body = buildIssueBody(analysis, consecutiveFailLimit);

    if (existingIssue) {
      await commentOnIssue(octokit, existingIssue, body);
    } else {
      await createIssue(octokit, body);
    }
  } else if (existingIssue) {
    await commentOnIssue(octokit, existingIssue, "✅ All clear — no regressions or assertion failures.");
    await closeIssue(octokit, existingIssue);
  }
}

async function createIssue(octokit: Octokit, body: string): Promise<void> {
  const { owner, repo } = getRepo();
  const labels = await ensureLabels(octokit);

  await octokit.rest.issues.create({
    owner,
    repo,
    title: ISSUE_TITLE,
    body,
    labels,
  });
}

async function commentOnIssue(octokit: Octokit, issueNumber: number, body: string): Promise<void> {
  const { owner, repo } = getRepo();
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

async function closeIssue(octokit: Octokit, issueNumber: number): Promise<void> {
  const { owner, repo } = getRepo();
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: "closed",
  });
}

/** Find an open issue with matching title and label. Returns issue number or null. */
export async function findOpenIssue(octokit: Octokit): Promise<number | null> {
  try {
    const { owner, repo } = getRepo();
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "open",
      labels: LABELS[0],
      per_page: 50,
    });

    const match = issues.find((i: { title: string }) => i.title.includes(ISSUE_TITLE));
    return match?.number ?? null;
  } catch {
    return null;
  }
}
