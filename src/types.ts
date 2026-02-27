export type Profile = "mobile" | "tablet" | "desktop";

/** History JSON schema (stored at history-path) */

export interface HistoryRun {
  metrics: Metrics;
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

/** Analysis result for a single URL×profile combination. */
export interface ProfileResult {
  profile: Profile;
  metrics: Metrics;
  runMetrics?: Metrics[];
  regressions: Regression[];
  assertions: AssertionResult[];
  consecutiveFailures: number;
  passed: boolean;
  reportLink?: string;
}

export const METRIC_DISPLAY_NAMES: Record<MetricKey, string> = {
  "first-contentful-paint": "First Contentful Paint",
  "largest-contentful-paint": "Largest Contentful Paint",
  "cumulative-layout-shift": "Cumulative Layout Shift",
  "total-blocking-time": "Total Blocking Time",
  "speed-index": "Speed Index",
  "interactive": "Time to Interactive",
};

export const METRIC_SHORT_NAMES: Record<MetricKey, string> = {
  "first-contentful-paint": "FCP",
  "largest-contentful-paint": "LCP",
  "cumulative-layout-shift": "CLS",
  "total-blocking-time": "TBT",
  "speed-index": "SI",
  "interactive": "TTI",
};

/** Analysis result for a single URL across all profiles. */
export interface UrlResult {
  url: string;
  pathname: string;
  profiles: ProfileResult[];
  passed: boolean;
}

/** Top-level analysis output from report mode. */
export interface AnalysisResult {
  urls: UrlResult[];
  allRegressions: Array<{ url: string; profile: Profile; regressions: Regression[] }>;
  hasRegressions: boolean;
  passed: boolean;
}

/** Parsed action inputs for report mode. */
export interface ReportConfig {
  resultsPath: string;
  regressionThreshold: number;
  consecutiveFailLimit: number;
  failOn: "error" | "warn" | "never";
  createIssues: boolean;
  historyPath: string;
  cleanupStalePaths: boolean;
  stalePathDays: number;
  maxHistoryRuns: number;
  githubToken: string;
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
