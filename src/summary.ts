import type { AnalysisResult } from "./types";
import { filterFailedAssertions, buildAssertionTable, buildRegressionsList } from "./utils";

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

      const failures = filterFailedAssertions(pr.assertions);
      if (failures.length > 0) {
        md += buildAssertionTable(failures);
      }

      if (pr.regressions.length > 0) {
        md += buildRegressionsList(pr.regressions);
      }

      if (pr.passed && failures.length === 0 && pr.regressions.length === 0) {
        md += `All checks passed.\n\n`;
      }
    }
  }

  return md;
}
