import { describe, it, expect } from "vitest";
import { detectRegressions } from "./regression";
import type { HistoryEntry, Metrics } from "./types";

function makeEntry(runMetrics: Metrics[]): HistoryEntry {
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
  it("no history means no regressions", () => {
    const result = detectRegressions(makeMetrics(), undefined, 10);
    expect(result).toEqual([]);
  });

  it("needs at least 2 data points before flagging anything", () => {
    const entry = makeEntry([makeMetrics({ "first-contentful-paint": 1000 })]);
    const result = detectRegressions(makeMetrics(), entry, 10);
    expect(result).toEqual([]);
  });

  it("detects a single metric regressing against a varying baseline", () => {
    // Site with natural FCP variation around ~1000ms
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 950 }),
      makeMetrics({ "first-contentful-paint": 1050 }),
      makeMetrics({ "first-contentful-paint": 980 }),
      makeMetrics({ "first-contentful-paint": 1020 }),
      makeMetrics({ "first-contentful-paint": 1000 }),
    ]);
    // avg = (950+1050+980+1020+1000)/5 = 1000
    // 1250 is 25% above avg → should trigger at 10% threshold
    const metrics = makeMetrics({ "first-contentful-paint": 1250 });
    const result = detectRegressions(metrics, entry, 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      metric: "first-contentful-paint",
      current: 1250,
      avg: 1000,
      percentChange: "25.0%",
    });
  });

  it("normal variation within threshold is not flagged", () => {
    // Same varying baseline, but current is within normal range
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 950, "speed-index": 1400 }),
      makeMetrics({ "first-contentful-paint": 1050, "speed-index": 1600 }),
      makeMetrics({ "first-contentful-paint": 1000, "speed-index": 1500 }),
    ]);
    // FCP avg=1000, current 1090 is 9% above → within 10% threshold
    // SI avg=1500, current 1630 is 8.7% above → within 10% threshold
    const metrics = makeMetrics({
      "first-contentful-paint": 1090,
      "speed-index": 1630,
    });
    const result = detectRegressions(metrics, entry, 10);
    expect(result).toEqual([]);
  });

  it("exactly at threshold boundary is not a regression", () => {
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 900 }),
      makeMetrics({ "first-contentful-paint": 1100 }),
    ]);
    // avg = 1000, 10% threshold → boundary is exactly 1100
    const metrics = makeMetrics({ "first-contentful-paint": 1100 });
    const result = detectRegressions(metrics, entry, 10);
    expect(result).toEqual([]);
  });

  it("performance improvement is never flagged (lower is better for all metrics)", () => {
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 1100 }),
      makeMetrics({ "first-contentful-paint": 900 }),
    ]);
    // avg = 1000, current 700 is an improvement
    const metrics = makeMetrics({ "first-contentful-paint": 700 });
    const result = detectRegressions(metrics, entry, 10);
    expect(result).toEqual([]);
  });

  it("only flags the regressed metric when others are fine", () => {
    // Realistic multi-metric history with natural variation
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 980, "total-blocking-time": 95, "cumulative-layout-shift": 0.04 }),
      makeMetrics({ "first-contentful-paint": 1020, "total-blocking-time": 105, "cumulative-layout-shift": 0.06 }),
      makeMetrics({ "first-contentful-paint": 1000, "total-blocking-time": 100, "cumulative-layout-shift": 0.05 }),
    ]);
    // FCP avg=1000, current 1300 → 30% regression
    // TBT avg=100, current 105 → 5%, within threshold
    // CLS avg=0.05, current 0.052 → 4%, within threshold
    const metrics = makeMetrics({
      "first-contentful-paint": 1300,
      "total-blocking-time": 105,
      "cumulative-layout-shift": 0.052,
    });
    const result = detectRegressions(metrics, entry, 10);

    expect(result).toHaveLength(1);
    expect(result[0].metric).toBe("first-contentful-paint");
  });

  it("detects multiple regressions across different metrics simultaneously", () => {
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 950, "total-blocking-time": 90 }),
      makeMetrics({ "first-contentful-paint": 1050, "total-blocking-time": 110 }),
    ]);
    // FCP avg=1000, current 1500 → 50%
    // TBT avg=100, current 200 → 100%
    const metrics = makeMetrics({
      "first-contentful-paint": 1500,
      "total-blocking-time": 200,
    });
    const result = detectRegressions(metrics, entry, 10);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.metric)).toContain("first-contentful-paint");
    expect(result.map((r) => r.metric)).toContain("total-blocking-time");
  });

  it("CLS regression works with small fractional numbers", () => {
    const entry = makeEntry([
      makeMetrics({ "cumulative-layout-shift": 0.04 }),
      makeMetrics({ "cumulative-layout-shift": 0.06 }),
    ]);
    // avg = 0.05, current 0.07 is 40% above → regression
    const metrics = makeMetrics({ "cumulative-layout-shift": 0.07 });
    const result = detectRegressions(metrics, entry, 10);

    expect(result).toHaveLength(1);
    expect(result[0].metric).toBe("cumulative-layout-shift");
  });

  it("window limits comparison to recent runs only", () => {
    // Site was slow (2000ms) for 8 runs, then improved to ~1000ms
    const runs = [
      ...Array.from({ length: 8 }, () => makeMetrics({ "first-contentful-paint": 2000 })),
      makeMetrics({ "first-contentful-paint": 950 }),
      makeMetrics({ "first-contentful-paint": 1050 }),
    ];
    const entry = makeEntry(runs);
    // windowSize=2 → avg of last 2 = 1000
    // current 1050 is only 5% above → no regression at 10%
    // Without windowing, avg would be ~1800, and 1050 would look like an improvement
    const metrics = makeMetrics({ "first-contentful-paint": 1050 });
    const result = detectRegressions(metrics, entry, 10, 2);
    expect(result).toEqual([]);
  });

  it("skips metrics missing from current run", () => {
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 1000, "speed-index": 1500 }),
      makeMetrics({ "first-contentful-paint": 1000, "speed-index": 1500 }),
    ]);
    const metrics = makeMetrics({ "speed-index": undefined });
    const result = detectRegressions(metrics, entry, 10);
    expect(result.find((r) => r.metric === "speed-index")).toBeUndefined();
  });

  it("skips metrics with no history data", () => {
    const entry = makeEntry([
      makeMetrics({ "first-contentful-paint": 1000, "speed-index": undefined }),
      makeMetrics({ "first-contentful-paint": 1000, "speed-index": undefined }),
    ]);
    // speed-index exists in current but has zero history → can't compute avg
    const metrics = makeMetrics({ "speed-index": 5000 });
    const result = detectRegressions(metrics, entry, 10);
    expect(result.find((r) => r.metric === "speed-index")).toBeUndefined();
  });

  it("handles zero historical average without producing Infinity", () => {
    const entry = makeEntry([
      makeMetrics({ "cumulative-layout-shift": 0 }),
      makeMetrics({ "cumulative-layout-shift": 0 }),
    ]);
    const metrics = makeMetrics({ "cumulative-layout-shift": 0.1 });
    const result = detectRegressions(metrics, entry, 10);

    expect(result).toHaveLength(1);
    expect(result[0].metric).toBe("cumulative-layout-shift");
    expect(result[0].avg).toBe(0);
    expect(result[0].current).toBe(0.1);
    expect(result[0].percentChange).not.toContain("Infinity");
  });

  it("zero current and zero avg is not a regression", () => {
    const entry = makeEntry([
      makeMetrics({ "cumulative-layout-shift": 0 }),
      makeMetrics({ "cumulative-layout-shift": 0 }),
    ]);
    const metrics = makeMetrics({ "cumulative-layout-shift": 0 });
    const result = detectRegressions(metrics, entry, 10);
    expect(result.find((r) => r.metric === "cumulative-layout-shift")).toBeUndefined();
  });
});
