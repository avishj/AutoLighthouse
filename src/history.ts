import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { History } from "./types";

const EMPTY_HISTORY: History = { version: 1, lastUpdated: "", paths: {} };

export function isPathSafe(inputPath: string): boolean {
  const normalized = inputPath.replace(/\\/g, "/");
  if (normalized.includes("..") || normalized.startsWith("/")) return false;
  return true;
}

export function validateHistoryPath(historyPath: string, workspace: string): string | null {
  if (!isPathSafe(historyPath)) return null;
  
  const resolved = resolve(workspace, historyPath);
  const workspaceResolved = resolve(workspace);
  
  if (!resolved.startsWith(workspaceResolved)) return null;
  
  return resolved;
}

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

/** Remove history entries not seen in `activeKeys` and older than `staleDays`. */
export function cleanupStalePaths(history: History, activeKeys: Set<string>, staleDays: number): string[] {
  const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];

  for (const key of Object.keys(history.paths)) {
    if (activeKeys.has(key)) continue;

    const entry = history.paths[key];
    const lastSeen = new Date(entry.lastSeen).getTime();
    if (isNaN(lastSeen) || lastSeen < cutoff) {
      delete history.paths[key];
      removed.push(key);
    }
  }

  return removed;
}
