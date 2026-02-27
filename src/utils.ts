import { resolve, sep } from "node:path";
import type { AssertionResult, MetricKey, Regression } from "./types";

export function isPathSafe(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false;
  if (normalized.split("/").includes("..")) return false;
  return true;
}

export function fmt(value: number): string {
  return value < 10 ? value.toFixed(3) : value.toFixed(1);
}

export function validatePathTraversal(
  userPath: string,
  basePath: string,
): string | null {
  const resolved = resolve(basePath, userPath);
  const resolvedBase = resolve(basePath);
  
  const isSamePath = resolved === resolvedBase;
  const isNestedPath = resolved.startsWith(resolvedBase + sep);
  
  const isRootBase = resolvedBase === sep || /^[a-zA-Z]:\\?$/.test(resolvedBase);
  const isValidRootCase = isRootBase && resolved.startsWith(resolvedBase);
  
  if (!isSamePath && !isNestedPath && !isValidRootCase) {
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

export function fmtMetricValue(key: MetricKey, value: number): string {
  if (key === "cumulative-layout-shift") {
    return value.toFixed(3);
  }
  if (key === "total-blocking-time") {
    return `${Math.round(value)}ms`;
  }
  return `${(value / 1000).toFixed(2)}s`;
}
