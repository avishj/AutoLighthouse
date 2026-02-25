import { describe, it, expect } from "vitest";
import { detectRegressions } from "./regression";
import type { HistoryEntry, Metrics } from "./types";

function makeEntry(runMetrics: Array<Record<string, number | undefined>>): HistoryEntry {
  return {
    consecutiveFailures: 0,
    lastSeen: new Date().toISOString(),
    runs: runMetrics.map((metrics) => ({
      metrics,
      timestamp: new Date().toISOString(),
    })),
  };
}

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    "first-contentful-paint": 1000,
    "largest-contentful-paint": 2000,
    "cumulative-layout-shift": 0.05,
    "total-blocking-time": 100,
    "speed-index": 1500,
    interactive: 3000,
    ...overrides,
  };
}

describe("detectRegressions", () => {
  it("returns empty when entry is undefined (no history)", () => {
    const result = detectRegressions(makeMetrics(), undefined, 10);
    expect(result).toEqual([]);
  });

  it("returns empty when fewer than 2 runs in history", () => {
    const entry = makeEntry([{ "first-contentful-paint": 1000 }]);
    const result = detectRegressions(makeMetrics(), entry, 10);
    expect(result).toEqual([]);
  });

  it("returns empty when exactly at threshold (not over)", () => {
    const avg = 1000;
    const entry = makeEntry([
      { "first-contentful-paint": avg },
      { "first-contentful-paint": avg },
    ]);
    // 10% threshold → 1100 is exactly the boundary, not exceeded
    const metrics = makeMetrics({ "first-contentful-paint": 1100 });
    const result = detectRegressions(metrics, entry, 10);
    expect(result).toEqual([]);
  });

  it("detects regression when metric exceeds threshold", () => {
    const entry = makeEntry([
      { "first-contentful-paint": 1000 },
      { "first-contentful-paint": 1000 },
    ]);
    const metrics = makeMetrics({ "first-contentful-paint": 1200 });
    const result = detectRegressions(metrics, entry, 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      metric: "first-contentful-paint",
      current: 1200,
      avg: 1000,
      percentChange: "20.0%",
    });
  });

  it("does not flag metrics that improved (lower is better)", () => {
    const entry = makeEntry([
      { "first-contentful-paint": 1000 },
      { "first-contentful-paint": 1000 },
    ]);
    const metrics = makeMetrics({ "first-contentful-paint": 800 });
    const result = detectRegressions(metrics, entry, 10);
    expect(result).toEqual([]);
  });

  it("detects CLS regression (small numbers)", () => {
    const entry = makeEntry([
      { "cumulative-layout-shift": 0.05 },
      { "cumulative-layout-shift": 0.05 },
    ]);
    // 0.07 is 40% above 0.05 → should trigger at 10% threshold
    const metrics = makeMetrics({ "cumulative-layout-shift": 0.07 });
    const result = detectRegressions(metrics, entry, 10);

    expect(result).toHaveLength(1);
    expect(result[0].metric).toBe("cumulative-layout-shift");
  });

  it("skips metrics that are undefined in current run", () => {
    const entry = makeEntry([
      { "first-contentful-paint": 1000, "speed-index": 1500 },
      { "first-contentful-paint": 1000, "speed-index": 1500 },
    ]);
    const metrics = makeMetrics({ "speed-index": undefined });
    const result = detectRegressions(metrics, entry, 10);
    // speed-index should not appear since current is undefined
    expect(result.find((r) => r.metric === "speed-index")).toBeUndefined();
  });

  it("skips metrics with no history values", () => {
    const entry = makeEntry([
      { "first-contentful-paint": 1000 },
      { "first-contentful-paint": 1000 },
    ]);
    // speed-index has no history data → avg is null → skip
    const metrics = makeMetrics({ "speed-index": 5000 });
    const result = detectRegressions(metrics, entry, 10);
    expect(result.find((r) => r.metric === "speed-index")).toBeUndefined();
  });

  it("uses only the last windowSize runs for average", () => {
    // 8 old runs at 1000, 2 recent runs at 2000
    const runs = [
      ...Array(8).fill({ "first-contentful-paint": 1000 }),
      { "first-contentful-paint": 2000 },
      { "first-contentful-paint": 2000 },
    ];
    const entry = makeEntry(runs);
    // windowSize=2 → avg is 2000, current 2100 is only 5% above → no regression at 10%
    const metrics = makeMetrics({ "first-contentful-paint": 2100 });
    const result = detectRegressions(metrics, entry, 10, 2);
    expect(result).toEqual([]);
  });

  it("handles zero average without producing Infinity", () => {
    const entry = makeEntry([
      { "cumulative-layout-shift": 0 },
      { "cumulative-layout-shift": 0 },
    ]);
    const metrics = makeMetrics({ "cumulative-layout-shift": 0.1 });
    const result = detectRegressions(metrics, entry, 10);

    expect(result).toHaveLength(1);
    expect(result[0].metric).toBe("cumulative-layout-shift");
    expect(result[0].avg).toBe(0);
    expect(result[0].current).toBe(0.1);
    expect(result[0].percentChange).not.toContain("Infinity");
  });

  it("does not regress when both avg and current are zero", () => {
    const entry = makeEntry([
      { "cumulative-layout-shift": 0 },
      { "cumulative-layout-shift": 0 },
    ]);
    const metrics = makeMetrics({ "cumulative-layout-shift": 0 });
    const result = detectRegressions(metrics, entry, 10);

    expect(result.find((r) => r.metric === "cumulative-layout-shift")).toBeUndefined();
  });

  it("detects multiple regressions across different metrics", () => {
    const entry = makeEntry([
      { "first-contentful-paint": 1000, "total-blocking-time": 100 },
      { "first-contentful-paint": 1000, "total-blocking-time": 100 },
    ]);
    const metrics = makeMetrics({
      "first-contentful-paint": 1500,
      "total-blocking-time": 200,
    });
    const result = detectRegressions(metrics, entry, 10);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.metric)).toContain("first-contentful-paint");
    expect(result.map((r) => r.metric)).toContain("total-blocking-time");
  });
});
