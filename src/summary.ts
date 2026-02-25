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

  return md;
}
