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
