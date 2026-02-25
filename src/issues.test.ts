import { describe, it, expect, beforeEach } from "vitest";
import { buildIssueBody } from "./issues";
import type { AnalysisResult, ProfileResult, Metrics } from "./types";

function makeMetrics(): Metrics {
  return {
    "first-contentful-paint": 1000,
    "largest-contentful-paint": 2000,
    "cumulative-layout-shift": 0.05,
    "total-blocking-time": 100,
    "speed-index": 1500,
    interactive: 3000,
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

describe("buildIssueBody", () => {
  beforeEach(() => {
    process.env.GITHUB_REF = "refs/heads/main";
    process.env.GITHUB_SHA = "abc1234567890";
  });

  it("includes header with timestamp, branch, and commit", () => {
    const analysis: AnalysisResult = {
      urls: [
        {
          url: "https://example.com/",
          pathname: "/",
          profiles: [makeProfile({ passed: false, assertions: [{ auditId: "perf", level: "error", actual: 0.4, expected: 0.9, operator: ">=", passed: false }] })],
          passed: false,
        },
      ],
      allRegressions: [],
      hasRegressions: false,
      passed: false,
    };
    const body = buildIssueBody(analysis, 3);
    expect(body).toContain("## Lighthouse Performance Alert");
    expect(body).toContain("**Branch:** main");
    expect(body).toContain("**Commit:** abc1234");
    expect(body).toContain("auto-managed by AutoLighthouse");
  });

  it("shows assertion failures table", () => {
    const analysis: AnalysisResult = {
      urls: [
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
      ],
      allRegressions: [],
      hasRegressions: false,
      passed: false,
    };
    const body = buildIssueBody(analysis, 3);
    expect(body).toContain("1 error(s), 1 warning(s)");
    expect(body).toContain("first-contentful-paint");
    expect(body).toContain("speed-index");
  });

  it("shows regressions", () => {
    const analysis: AnalysisResult = {
      urls: [
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
      ],
      allRegressions: [{ url: "https://example.com/", profile: "mobile", regressions: [{ metric: "first-contentful-paint", current: 1500, avg: 1000, percentChange: "50.0%" }] }],
      hasRegressions: true,
      passed: false,
    };
    const body = buildIssueBody(analysis, 3);
    expect(body).toContain("**Regressions:**");
    expect(body).toContain("first-contentful-paint");
    expect(body).toContain("50.0%");
  });

  it("shows persistent failure warning", () => {
    const analysis: AnalysisResult = {
      urls: [
        {
          url: "https://example.com/",
          pathname: "/",
          profiles: [
            makeProfile({
              passed: false,
              consecutiveFailures: 5,
              assertions: [{ auditId: "perf", level: "error", actual: 0.4, expected: 0.9, operator: ">=", passed: false }],
            }),
          ],
          passed: false,
        },
      ],
      allRegressions: [],
      hasRegressions: false,
      passed: false,
    };
    const body = buildIssueBody(analysis, 3);
    expect(body).toContain("⚠️ **Persistent failure**");
    expect(body).toContain("5 consecutive runs");
  });

  it("skips passed URLs entirely", () => {
    const analysis: AnalysisResult = {
      urls: [
        { url: "https://example.com/", pathname: "/", profiles: [makeProfile()], passed: true },
        {
          url: "https://example.com/bad",
          pathname: "/bad",
          profiles: [makeProfile({ passed: false, assertions: [{ auditId: "perf", level: "error", actual: 0.4, expected: 0.9, operator: ">=", passed: false }] })],
          passed: false,
        },
      ],
      allRegressions: [],
      hasRegressions: false,
      passed: false,
    };
    const body = buildIssueBody(analysis, 3);
    expect(body).not.toContain("### /\n");
    expect(body).toContain("### /bad");
  });

  it("includes report link when available", () => {
    const analysis: AnalysisResult = {
      urls: [
        {
          url: "https://example.com/",
          pathname: "/",
          profiles: [
            makeProfile({
              passed: false,
              reportLink: "https://storage.example.com/report",
              assertions: [{ auditId: "perf", level: "error", actual: 0.4, expected: 0.9, operator: ">=", passed: false }],
            }),
          ],
          passed: false,
        },
      ],
      allRegressions: [],
      hasRegressions: false,
      passed: false,
    };
    const body = buildIssueBody(analysis, 3);
    expect(body).toContain("[View report](https://storage.example.com/report)");
  });
});
