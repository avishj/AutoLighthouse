import type { ReportConfig } from "./types";

/** Parse report mode config from environment variables. */
export function parseConfig(): ReportConfig {
  return {
    resultsPath: process.env.INPUT_RESULTS_PATH || ".autolighthouse-results",
    regressionThreshold: parseInt(process.env.INPUT_REGRESSION_THRESHOLD || "10", 10),
    consecutiveFailLimit: parseInt(process.env.INPUT_CONSECUTIVE_FAIL_LIMIT || "3", 10),
    failOn: parseFailOn(process.env.INPUT_FAIL_ON),
    createIssues: process.env.INPUT_CREATE_ISSUES !== "false",
    historyPath: process.env.INPUT_HISTORY_PATH || ".lighthouse/history.json",
    cleanupStalePaths: process.env.INPUT_CLEANUP_STALE_PATHS === "true",
    stalePathDays: parseInt(process.env.INPUT_STALE_PATH_DAYS || "30", 10),
    maxHistoryRuns: parseInt(process.env.INPUT_MAX_HISTORY_RUNS || "100", 10),
    githubToken: process.env.INPUT_GITHUB_TOKEN || "",
  };
}

function parseFailOn(value: string | undefined): ReportConfig["failOn"] {
  if (value === "warn" || value === "never") return value;
  return "error";
}
