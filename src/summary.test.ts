import { describe, it, expect } from "vitest";
import { buildSummary } from "./summary";
import type { AnalysisResult, UrlResult, ProfileResult, Metrics } from "./types";

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

function makeProfile(overrides: Partial<ProfileResult> = {}): ProfileResult {
  return {
    profile: "mobile",
    metrics: makeMetrics(),
    regressions: [],
    assertions: [],
    consecutiveFailures: 0,
    passed: true,
    ...overrides,
  };
}

function makeAnalysis(urls: UrlResult[]): AnalysisResult {
  const allRegressions = urls.flatMap((u) =>
    u.profiles
      .filter((p) => p.regressions.length > 0)
      .map((p) => ({ url: u.url, profile: p.profile, regressions: p.regressions })),
  );
  return {
    urls,
    allRegressions,
    hasRegressions: allRegressions.length > 0,
    passed: urls.every((u) => u.passed),
  };
}

describe("buildSummary", () => {
  it("shows passing status when all checks pass", () => {
    const analysis = makeAnalysis([
      {
        url: "https://example.com/",
        pathname: "/",
        profiles: [makeProfile()],
        passed: true,
      },
    ]);
    const md = buildSummary(analysis);
    expect(md).toContain("✅ Lighthouse Report");
    expect(md).toContain("✅ /");
    expect(md).toContain("All checks passed");
    expect(md).toContain("Regressions:** 0");
  });

  it("shows failing status with assertion failures", () => {
    const analysis = makeAnalysis([
      {
        url: "https://example.com/",
        pathname: "/",
        profiles: [
          makeProfile({
            passed: false,
            assertions: [
              { auditId: "first-contentful-paint", level: "error", actual: 0.4, expected: 0.9, operator: ">=", passed: false },
              { auditId: "speed-index", level: "warn", actual: 0.6, expected: 0.8, operator: ">=", passed: false },
            ],
          }),
        ],
        passed: false,
      },
    ]);
    const md = buildSummary(analysis);
    expect(md).toContain("❌ Lighthouse Report");
    expect(md).toContain("first-contentful-paint");
    expect(md).toContain("speed-index");
    expect(md).toContain("error");
    expect(md).toContain("warn");
  });

  it("shows regressions", () => {
    const analysis = makeAnalysis([
      {
        url: "https://example.com/",
        pathname: "/",
        profiles: [
          makeProfile({
            passed: false,
            regressions: [
              { metric: "first-contentful-paint", current: 1500, avg: 1000, percentChange: "50.0%" },
            ],
          }),
        ],
        passed: false,
      },
    ]);
    const md = buildSummary(analysis);
    expect(md).toContain("Regressions:**");
    expect(md).toContain("first-contentful-paint");
    expect(md).toContain("50.0%");
    expect(md).toContain("1000");
    expect(md).toContain("1500");
  });

  it("includes report link when available", () => {
    const analysis = makeAnalysis([
      {
        url: "https://example.com/",
        pathname: "/",
        profiles: [makeProfile({ reportLink: "https://storage.example.com/report.html" })],
        passed: true,
      },
    ]);
    const md = buildSummary(analysis);
    expect(md).toContain("[View report](https://storage.example.com/report.html)");
  });

  it("handles multiple URLs and profiles", () => {
    const analysis = makeAnalysis([
      {
        url: "https://example.com/",
        pathname: "/",
        profiles: [makeProfile({ profile: "mobile" }), makeProfile({ profile: "desktop" })],
        passed: true,
      },
      {
        url: "https://example.com/about",
        pathname: "/about",
        profiles: [makeProfile({ profile: "mobile" })],
        passed: true,
      },
    ]);
    const md = buildSummary(analysis);
    expect(md).toContain("URLs:** 2 audited");
    expect(md).toContain("/about");
    expect(md).toContain("mobile");
    expect(md).toContain("desktop");
  });
});
