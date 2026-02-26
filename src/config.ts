import type { ReportConfig } from "./types";

const DEFAULT_REGRESSION_THRESHOLD = 10;
const DEFAULT_CONSECUTIVE_FAIL_LIMIT = 3;
const DEFAULT_STALE_PATH_DAYS = 30;
const DEFAULT_MAX_HISTORY_RUNS = 100;

/** Parse report mode config from environment variables. */
export function parseConfig(): ReportConfig {
  return {
    resultsPath: process.env.INPUT_RESULTS_PATH || ".autolighthouse-results",
    regressionThreshold: parseRegressionThreshold(process.env.INPUT_REGRESSION_THRESHOLD),
    consecutiveFailLimit: parseConsecutiveFailLimit(process.env.INPUT_CONSECUTIVE_FAIL_LIMIT),
    failOn: parseFailOn(process.env.INPUT_FAIL_ON),
    createIssues: process.env.INPUT_CREATE_ISSUES !== "false",
    historyPath: process.env.INPUT_HISTORY_PATH || ".lighthouse/history.json",
    cleanupStalePaths: process.env.INPUT_CLEANUP_STALE_PATHS === "true",
    stalePathDays: parsePositiveInt(process.env.INPUT_STALE_PATH_DAYS, DEFAULT_STALE_PATH_DAYS),
    maxHistoryRuns: parsePositiveInt(process.env.INPUT_MAX_HISTORY_RUNS, DEFAULT_MAX_HISTORY_RUNS),
    githubToken: process.env.INPUT_GITHUB_TOKEN || "",
  };
}

function parseRegressionThreshold(value: string | undefined): number {
  const parsed = parsePositiveInt(value, DEFAULT_REGRESSION_THRESHOLD);
  return Math.min(parsed, 100);
}

function parseConsecutiveFailLimit(value: string | undefined): number {
  return parsePositiveInt(value, DEFAULT_CONSECUTIVE_FAIL_LIMIT);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseFailOn(value: string | undefined): ReportConfig["failOn"] {
  if (value === "warn" || value === "never") return value;
  return "error";
}
