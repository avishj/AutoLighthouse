import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { History } from "./types";
import { isPathSafe } from "./utils";

function warn(message: string): void {
	if (typeof console !== "undefined") {
		console.warn(`[AutoLighthouse] ${message}`);
	}
}

const EMPTY_HISTORY: History = { version: 1, lastUpdated: "", paths: {} };

export function validateHistoryPath(historyPath: string, workspace: string): string | null {
	if (!isPathSafe(historyPath)) return null;

	const resolved = resolve(workspace, historyPath);
	const workspaceResolved = resolve(workspace);

	const rel = relative(workspaceResolved, resolved);
	if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;

	return resolved;
}

function getLockPath(historyPath: string): string {
	return `${historyPath}.lock`;
}

async function acquireLock(lockPath: string): Promise<boolean> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			writeFileSync(lockPath, String(process.pid), { flag: "wx" });
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
				throw err;
			}
			if (attempt < 2) {
				await setTimeout(50);
			}
		}
	}
	return false;
}

function releaseLock(lockPath: string): void {
	try {
		unlinkSync(lockPath);
	} catch {
		// Best effort cleanup
	}
}

/** Load history from disk. Returns empty history if file doesn't exist or is invalid. */
export function loadHistory(historyPath: string): History {
	if (!historyPath || !existsSync(historyPath)) return { ...EMPTY_HISTORY, paths: {} };
	try {
		const data = JSON.parse(readFileSync(historyPath, "utf-8"));
		return { ...EMPTY_HISTORY, ...data };
	} catch (err) {
		warn(`Failed to load history from ${historyPath}: ${err instanceof Error ? err.message : "unknown error"}`);
		return { ...EMPTY_HISTORY, paths: {} };
	}
}

/** Save history to disk with file locking, trimming runs per key to prevent bloat. */
export async function saveHistory(historyPath: string, history: History, maxRunsPerKey: number): Promise<void> {
	const lockPath = getLockPath(historyPath);

	mkdirSync(dirname(lockPath), { recursive: true });

	if (!(await acquireLock(lockPath))) {
		throw new Error(`Failed to acquire lock for ${historyPath}. Another process may be writing to it.`);
	}

	try {
		for (const entry of Object.values(history.paths)) {
			if (entry.runs.length > maxRunsPerKey) {
				entry.runs = entry.runs.slice(-maxRunsPerKey);
			}
		}

		history.lastUpdated = new Date().toISOString();
		mkdirSync(dirname(historyPath), { recursive: true });
		writeFileSync(historyPath, JSON.stringify(history, null, 2));
	} finally {
		releaseLock(lockPath);
	}
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
