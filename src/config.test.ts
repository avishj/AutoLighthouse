import { describe, it, expect, beforeEach } from "vitest";
import { parseConfig } from "./config";

const ENV_KEYS = [
  "INPUT_RESULTS_PATH",
  "INPUT_REGRESSION_THRESHOLD",
  "INPUT_CONSECUTIVE_FAIL_LIMIT",
  "INPUT_FAIL_ON",
  "INPUT_CREATE_ISSUES",
  "INPUT_HISTORY_PATH",
  "INPUT_CLEANUP_STALE_PATHS",
  "INPUT_STALE_PATH_DAYS",
  "INPUT_MAX_HISTORY_RUNS",
  "INPUT_GITHUB_TOKEN",
] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("parseConfig", () => {
  beforeEach(clearEnv);

  it("returns defaults when no env vars set", () => {
    const cfg = parseConfig();
    expect(cfg).toEqual({
      resultsPath: ".autolighthouse-results",
      regressionThreshold: 10,
      consecutiveFailLimit: 3,
      failOn: "error",
      createIssues: true,
      historyPath: ".lighthouse/history.json",
      cleanupStalePaths: false,
      stalePathDays: 30,
      maxHistoryRuns: 100,
      githubToken: "",
    });
  });

  it("reads all env overrides", () => {
    process.env.INPUT_RESULTS_PATH = "/tmp/results";
    process.env.INPUT_REGRESSION_THRESHOLD = "25";
    process.env.INPUT_CONSECUTIVE_FAIL_LIMIT = "5";
    process.env.INPUT_FAIL_ON = "warn";
    process.env.INPUT_CREATE_ISSUES = "false";
    process.env.INPUT_HISTORY_PATH = "custom/history.json";
    process.env.INPUT_CLEANUP_STALE_PATHS = "true";
    process.env.INPUT_STALE_PATH_DAYS = "7";
    process.env.INPUT_MAX_HISTORY_RUNS = "50";
    process.env.INPUT_GITHUB_TOKEN = "ghp_abc123";

    const cfg = parseConfig();
    expect(cfg).toEqual({
      resultsPath: "/tmp/results",
      regressionThreshold: 25,
      consecutiveFailLimit: 5,
      failOn: "warn",
      createIssues: false,
      historyPath: "custom/history.json",
      cleanupStalePaths: true,
      stalePathDays: 7,
      maxHistoryRuns: 50,
      githubToken: "ghp_abc123",
    });
  });

  it("failOn defaults to error for invalid values", () => {
    process.env.INPUT_FAIL_ON = "invalid";
    expect(parseConfig().failOn).toBe("error");
  });

  it("failOn accepts never", () => {
    process.env.INPUT_FAIL_ON = "never";
    expect(parseConfig().failOn).toBe("never");
  });

  it("createIssues is true for any value except 'false'", () => {
    process.env.INPUT_CREATE_ISSUES = "true";
    expect(parseConfig().createIssues).toBe(true);

    process.env.INPUT_CREATE_ISSUES = "yes";
    expect(parseConfig().createIssues).toBe(true);

    process.env.INPUT_CREATE_ISSUES = "";
    expect(parseConfig().createIssues).toBe(true);
  });

  it("cleanupStalePaths is false for any value except 'true'", () => {
    process.env.INPUT_CLEANUP_STALE_PATHS = "false";
    expect(parseConfig().cleanupStalePaths).toBe(false);

    process.env.INPUT_CLEANUP_STALE_PATHS = "yes";
    expect(parseConfig().cleanupStalePaths).toBe(false);
  });

  it("falls back to defaults for non-numeric values", () => {
    process.env.INPUT_REGRESSION_THRESHOLD = "abc";
    process.env.INPUT_CONSECUTIVE_FAIL_LIMIT = "xyz";
    process.env.INPUT_STALE_PATH_DAYS = "";
    process.env.INPUT_MAX_HISTORY_RUNS = "not-a-number";

    const cfg = parseConfig();
    expect(cfg.regressionThreshold).toBe(10);
    expect(cfg.consecutiveFailLimit).toBe(3);
    expect(cfg.stalePathDays).toBe(30);
    expect(cfg.maxHistoryRuns).toBe(100);
  });
});
