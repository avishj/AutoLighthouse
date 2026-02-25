import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { History } from "./types";

const EMPTY_HISTORY: History = { version: 1, lastUpdated: "", paths: {} };

/** Load history from disk. Returns empty history if file doesn't exist or is invalid. */
export function loadHistory(historyPath: string): History {
  if (!historyPath || !existsSync(historyPath)) return { ...EMPTY_HISTORY, paths: {} };
  try {
    const data = JSON.parse(readFileSync(historyPath, "utf-8"));
    return { ...EMPTY_HISTORY, ...data };
  } catch {
    return { ...EMPTY_HISTORY, paths: {} };
  }
}

/** Save history to disk, trimming runs per key to prevent bloat. */
export function saveHistory(historyPath: string, history: History, maxRunsPerKey: number): void {
  for (const entry of Object.values(history.paths)) {
    if (entry.runs.length > maxRunsPerKey) {
      entry.runs = entry.runs.slice(-maxRunsPerKey);
    }
  }

  history.lastUpdated = new Date().toISOString();
  mkdirSync(dirname(historyPath), { recursive: true });
  writeFileSync(historyPath, JSON.stringify(history, null, 2));
}
