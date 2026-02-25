import type { ReportConfig } from "./types";

/** Parse report mode config from environment variables. */
export function parseConfig(): ReportConfig {
  return {
    resultsPath: process.env.INPUT_RESULTS_PATH || ".autolighthouse-results",
    regressionThreshold: parseIntOr(process.env.INPUT_REGRESSION_THRESHOLD, 10),
    consecutiveFailLimit: parseIntOr(process.env.INPUT_CONSECUTIVE_FAIL_LIMIT, 3),
    failOn: parseFailOn(process.env.INPUT_FAIL_ON),
    createIssues: process.env.INPUT_CREATE_ISSUES !== "false",
    historyPath: process.env.INPUT_HISTORY_PATH || ".lighthouse/history.json",
    cleanupStalePaths: process.env.INPUT_CLEANUP_STALE_PATHS === "true",
    stalePathDays: parseIntOr(process.env.INPUT_STALE_PATH_DAYS, 30),
    maxHistoryRuns: parseIntOr(process.env.INPUT_MAX_HISTORY_RUNS, 100),
    githubToken: process.env.INPUT_GITHUB_TOKEN || "",
  };
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function parseFailOn(value: string | undefined): ReportConfig["failOn"] {
  if (value === "warn" || value === "never") return value;
  return "error";
}
