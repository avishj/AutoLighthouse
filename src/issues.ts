import * as github from "@actions/github";
import type { AnalysisResult } from "./types";

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

/** Build consolidated issue body — URL-first, profiles nested under each URL. */
export function buildIssueBody(
  analysis: AnalysisResult,
  consecutiveFailLimit: number,
): string {
  const timestamp = new Date().toISOString();
  const branch = process.env.GITHUB_REF?.replace("refs/heads/", "") ?? "unknown";
  const commit = process.env.GITHUB_SHA?.substring(0, 7) ?? "unknown";

  let body = `## Lighthouse Performance Alert\n\n`;
  body += `**Timestamp:** ${timestamp}\n`;
  body += `**Branch:** ${branch}\n`;
  body += `**Commit:** ${commit}\n\n`;

  const fmt = (v: number) => (v < 10 ? v.toFixed(3) : v.toFixed(1));

  for (const url of analysis.urls) {
    if (url.passed) continue;

    body += `### ${url.pathname}\n\n`;

    for (const pr of url.profiles) {
      if (pr.passed) continue;

      body += `#### ${pr.profile}\n\n`;

      if (pr.reportLink) {
        body += `[View report](${pr.reportLink})\n\n`;
      }

      const failures = pr.assertions.filter((a) => !a.passed);
      if (failures.length > 0) {
        const errors = failures.filter((a) => a.level === "error").length;
        const warns = failures.filter((a) => a.level === "warn").length;
        body += `**Assertion Failures:** ${errors} error(s), ${warns} warning(s)\n\n`;
        body += `| Audit | Level | Actual | Threshold |\n`;
        body += `|-------|-------|--------|----------|\n`;
        for (const a of failures) {
          body += `| ${a.auditId} | ${a.level} | ${a.actual ?? "—"} | ${a.operator ?? ""} ${a.expected ?? "—"} |\n`;
        }
        body += "\n";
      }

      if (pr.regressions.length > 0) {
        body += `**Regressions:**\n`;
        for (const r of pr.regressions) {
          body += `- ${r.metric}: ${fmt(r.avg)} → ${fmt(r.current)} (${r.percentChange})\n`;
        }
        body += "\n";
      }

      if (pr.consecutiveFailures >= consecutiveFailLimit) {
        body += `⚠️ **Persistent failure** — ${pr.consecutiveFailures} consecutive runs\n\n`;
      }
    }
  }

  body += `---\n_This issue is auto-managed by AutoLighthouse._`;
  return body;
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

    const match = issues.find((i) => i.title.includes(ISSUE_TITLE));
    return match?.number ?? null;
  } catch {
    return null;
  }
}
