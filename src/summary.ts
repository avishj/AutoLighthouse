import type { AnalysisResult } from "./types";

/** Generate GitHub Actions step summary markdown. */
export function buildSummary(analysis: AnalysisResult): string {
  const status = analysis.passed ? "✅" : "❌";
  let md = `## ${status} Lighthouse Report\n\n`;

  const totalUrls = analysis.urls.length;
  const failedUrls = analysis.urls.filter((u) => !u.passed).length;
  const totalRegressions = analysis.allRegressions.length;

  md += `**URLs:** ${totalUrls} audited, ${failedUrls} with issues\n`;
  md += `**Regressions:** ${totalRegressions}\n\n`;

  for (const url of analysis.urls) {
    const urlStatus = url.passed ? "✅" : "❌";
    md += `### ${urlStatus} ${url.pathname}\n\n`;

    for (const pr of url.profiles) {
      const prStatus = pr.passed ? "✅" : "❌";
      md += `#### ${prStatus} ${pr.profile}\n\n`;

      if (pr.reportLink) {
        md += `[View report](${pr.reportLink})\n\n`;
      }

      const failures = pr.assertions.filter((a) => !a.passed);
      if (failures.length > 0) {
        md += `| Audit | Level | Actual | Threshold |\n`;
        md += `|-------|-------|--------|----------|\n`;
        for (const a of failures) {
          md += `| ${a.auditId} | ${a.level} | ${a.actual ?? "—"} | ${a.operator ?? ""} ${a.expected ?? "—"} |\n`;
        }
        md += "\n";
      }

      if (pr.regressions.length > 0) {
        md += `**Regressions:**\n`;
        for (const r of pr.regressions) {
          const fmt = (v: number) => (v < 10 ? v.toFixed(3) : v.toFixed(1));
          md += `- ${r.metric}: ${fmt(r.avg)} → ${fmt(r.current)} (${r.percentChange})\n`;
        }
        md += "\n";
      }

      if (pr.passed && failures.length === 0 && pr.regressions.length === 0) {
        md += `All checks passed.\n\n`;
      }
    }
  }

  return md;
}
