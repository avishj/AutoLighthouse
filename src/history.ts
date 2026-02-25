import { readFileSync, existsSync } from "node:fs";
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
