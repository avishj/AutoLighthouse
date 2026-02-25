export type Profile = "mobile" | "tablet" | "desktop";

/** History JSON schema (stored at history-path) */

export interface HistoryRun {
  metrics: Record<string, number | undefined>;
  timestamp: string;
}

export interface HistoryEntry {
  consecutiveFailures: number;
  lastSeen: string;
  runs: HistoryRun[];
}

/** Top-level history file structure. Keys in `paths` are `{profile}:{pathname}`. */
export interface History {
  version: 1;
  lastUpdated: string;
  paths: Record<string, HistoryEntry>;
}

/** The 6 core Lighthouse metrics we track. */
export const METRIC_KEYS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "cumulative-layout-shift",
  "total-blocking-time",
  "speed-index",
  "interactive",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type Metrics = Record<MetricKey, number | undefined>;

export interface Regression {
  metric: MetricKey;
  current: number;
  avg: number;
  percentChange: string;
}

/** Assertion result from treosh/lighthouse-ci-action. */
export interface AssertionResult {
  auditId: string;
  level: "warn" | "error";
  actual: number;
  expected: number;
  operator: string;
  passed: boolean;
  url?: string;
}
