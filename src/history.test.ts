import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadHistory, saveHistory, cleanupStalePaths, validateHistoryPath } from "./history";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { History, Metrics } from "./types";

const makeMetrics = (overrides: Partial<Metrics> = {}): Metrics => ({
  "first-contentful-paint": 1000,
  "largest-contentful-paint": 2000,
  "cumulative-layout-shift": 0.1,
  "total-blocking-time": 300,
  "speed-index": 4000,
  "interactive": 5000,
  ...overrides,
});

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `autolighthouse-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true });
});

describe("loadHistory", () => {
  it("returns empty history for non-existent file", () => {
    const h = loadHistory(join(testDir, "nope.json"));
    expect(h).toEqual({ version: 1, lastUpdated: "", paths: {} });
  });

  it("returns empty history for empty string path", () => {
    const h = loadHistory("");
    expect(h).toEqual({ version: 1, lastUpdated: "", paths: {} });
  });

  it("returns empty history for invalid JSON", () => {
    const path = join(testDir, "bad.json");
    writeFileSync(path, "not json");
    const h = loadHistory(path);
    expect(h).toEqual({ version: 1, lastUpdated: "", paths: {} });
  });

  it("loads valid history file", () => {
    const path = join(testDir, "history.json");
    const data: History = {
      version: 1,
      lastUpdated: "2025-01-01T00:00:00.000Z",
      paths: {
        "mobile:/": {
          consecutiveFailures: 2,
          lastSeen: "2025-01-01T00:00:00.000Z",
          runs: [{ metrics: makeMetrics({ "first-contentful-paint": 1000 }), timestamp: "2025-01-01T00:00:00.000Z" }],
        },
      },
    };
    writeFileSync(path, JSON.stringify(data));
    const h = loadHistory(path);
    expect(h.paths["mobile:/"]).toBeDefined();
    expect(h.paths["mobile:/"].runs).toHaveLength(1);
  });
});

describe("saveHistory", () => {
  it("creates parent directories and writes file", () => {
    const path = join(testDir, "nested", "deep", "history.json");
    const history: History = {
      version: 1,
      lastUpdated: "",
      paths: {
        "mobile:/": {
          consecutiveFailures: 0,
          lastSeen: "",
          runs: [{ metrics: makeMetrics({ "first-contentful-paint": 500 }), timestamp: "" }],
        },
      },
    };

    saveHistory(path, history, 100);

    expect(existsSync(path)).toBe(true);
    const saved = JSON.parse(readFileSync(path, "utf-8"));
    expect(saved.version).toBe(1);
    expect(saved.lastUpdated).not.toBe("");
    expect(saved.paths["mobile:/"]).toBeDefined();
  });

  it("trims runs to maxRunsPerKey", () => {
    const path = join(testDir, "history.json");
    const runs = Array.from({ length: 10 }, (_, i) => ({
      metrics: makeMetrics({ "first-contentful-paint": 1000 + i }),
      timestamp: new Date(2025, 0, i + 1).toISOString(),
    }));

    const history: History = {
      version: 1,
      lastUpdated: "",
      paths: { "mobile:/": { consecutiveFailures: 0, lastSeen: "", runs } },
    };

    saveHistory(path, history, 3);

    const saved = JSON.parse(readFileSync(path, "utf-8"));
    expect(saved.paths["mobile:/"].runs).toHaveLength(3);
    // Should keep the last 3
    expect(saved.paths["mobile:/"].runs[0].metrics["first-contentful-paint"]).toBe(1007);
  });

  it("throws when lock cannot be acquired", () => {
    const path = join(testDir, "history.json");
    const lockPath = join(testDir, ".history.lock");
    writeFileSync(lockPath, "9999"); // Pre-existing lock

    const history: History = {
      version: 1,
      lastUpdated: "",
      paths: { "mobile:/": { consecutiveFailures: 0, lastSeen: "", runs: [] } },
    };

    expect(() => saveHistory(path, history, 10)).toThrow("Failed to acquire lock");
  });
});

describe("cleanupStalePaths", () => {
  it("removes entries not in activeKeys and older than staleDays", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
    const history: History = {
      version: 1,
      lastUpdated: "",
      paths: {
        "mobile:/": { consecutiveFailures: 0, lastSeen: oldDate, runs: [] },
        "desktop:/": { consecutiveFailures: 0, lastSeen: new Date().toISOString(), runs: [] },
      },
    };

    const activeKeys = new Set(["desktop:/"]);
    const removed = cleanupStalePaths(history, activeKeys, 30);

    expect(removed).toEqual(["mobile:/"]);
    expect(history.paths["mobile:/"]).toBeUndefined();
    expect(history.paths["desktop:/"]).toBeDefined();
  });

  it("keeps inactive entries that are not yet stale", () => {
    const recentDate = new Date().toISOString();
    const history: History = {
      version: 1,
      lastUpdated: "",
      paths: {
        "mobile:/": { consecutiveFailures: 0, lastSeen: recentDate, runs: [] },
      },
    };

    const removed = cleanupStalePaths(history, new Set(), 30);
    expect(removed).toEqual([]);
    expect(history.paths["mobile:/"]).toBeDefined();
  });

  it("removes entries with invalid lastSeen date", () => {
    const history: History = {
      version: 1,
      lastUpdated: "",
      paths: {
        "mobile:/": { consecutiveFailures: 0, lastSeen: "not-a-date", runs: [] },
      },
    };

    const removed = cleanupStalePaths(history, new Set(), 30);
    expect(removed).toEqual(["mobile:/"]);
  });

  it("does not remove active keys regardless of age", () => {
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const history: History = {
      version: 1,
      lastUpdated: "",
      paths: {
        "mobile:/": { consecutiveFailures: 0, lastSeen: oldDate, runs: [] },
      },
    };

    const removed = cleanupStalePaths(history, new Set(["mobile:/"]), 30);
    expect(removed).toEqual([]);
    expect(history.paths["mobile:/"]).toBeDefined();
  });
});

describe("validateHistoryPath", () => {
	it("rejects path that resolves to the workspace root", () => {
		expect(validateHistoryPath(".", testDir)).toBeNull();
		expect(validateHistoryPath("", testDir)).toBeNull();
		expect(validateHistoryPath("sub/..", testDir)).toBeNull();
	});

	it("rejects path traversal above workspace", () => {
		expect(validateHistoryPath("../outside", testDir)).toBeNull();
		expect(validateHistoryPath("sub/../../outside", testDir)).toBeNull();
	});

	it("accepts a valid relative path within workspace", () => {
		const result = validateHistoryPath("history.json", testDir);
		expect(result).toBe(join(testDir, "history.json"));
	});

	it("accepts a nested relative path within workspace", () => {
		const result = validateHistoryPath("sub/dir/history.json", testDir);
		expect(result).toBe(join(testDir, "sub", "dir", "history.json"));
	});
});