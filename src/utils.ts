import { resolve } from "node:path";
import type { AssertionResult, Regression } from "./types";

export function fmt(value: number): string {
  return value < 10 ? value.toFixed(3) : value.toFixed(1);
}

export function validatePathTraversal(
  userPath: string,
  basePath: string,
): string | null {
  const resolved = resolve(basePath, userPath);
  const resolvedBase = resolve(basePath);
  
  if (!resolved.startsWith(resolvedBase)) {
    return null;
  }
  
  return resolved;
}

export function filterFailedAssertions(assertions: AssertionResult[]): AssertionResult[] {
  return assertions.filter((a) => !a.passed);
}

export function countAssertionLevels(assertions: AssertionResult[]): { errors: number; warnings: number } {
  const errors = assertions.filter((a) => a.level === "error").length;
  const warnings = assertions.filter((a) => a.level === "warn").length;
  return { errors, warnings };
}

export function buildAssertionTable(assertions: AssertionResult[]): string {
  if (assertions.length === 0) return "";
  
  let md = `| Audit | Level | Actual | Threshold |\n`;
  md += `|-------|-------|--------|----------|\n`;
  for (const a of assertions) {
    md += `| ${a.auditId} | ${a.level} | ${a.actual ?? "—"} | ${a.operator ?? ""} ${a.expected ?? "—"} |\n`;
  }
  md += "\n";
  return md;
}

export function buildRegressionsList(regressions: Regression[]): string {
  if (regressions.length === 0) return "";
  
  let md = `**Regressions:**\n`;
  for (const r of regressions) {
    md += `- ${r.metric}: ${fmt(r.avg)} → ${fmt(r.current)} (${r.percentChange})\n`;
  }
  md += "\n";
  return md;
}
