import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildIssueBody, manageIssue, findOpenIssue } from "./issues";
import type { AnalysisResult, ProfileResult, Metrics } from "./types";
import * as github from "@actions/github";

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

describe("manageIssue", () => {
  beforeEach(() => {
    vi.spyOn(github.context, "repo", "get").mockReturnValue({ owner: "test-owner", repo: "test-repo" });
    process.env.GITHUB_REF = "refs/heads/main";
    process.env.GITHUB_SHA = "abc1234567890";
  });

  it("creates issue when analysis fails and no existing issue", async () => {
    const createFn = vi.fn().mockResolvedValue({});
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({ data: [] }),
          create: createFn,
          createLabel: vi.fn().mockResolvedValue({}),
        },
      },
    } as any;

    const analysis: AnalysisResult = {
      urls: [{ url: "https://example.com/", pathname: "/", profiles: [], passed: false }],
      allRegressions: [],
      hasRegressions: false,
      passed: false,
    };

    await manageIssue(mockOctokit, analysis, 3);

    expect(createFn).toHaveBeenCalled();
  });

  it("comments on existing issue when analysis fails", async () => {
    const commentFn = vi.fn().mockResolvedValue({});
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({ data: [{ number: 5, title: "Lighthouse Performance Alert" }] }),
          createComment: commentFn,
        },
      },
    } as any;

    const analysis: AnalysisResult = {
      urls: [{ url: "https://example.com/", pathname: "/", profiles: [], passed: false }],
      allRegressions: [],
      hasRegressions: false,
      passed: false,
    };

    await manageIssue(mockOctokit, analysis, 3);

    expect(commentFn).toHaveBeenCalled();
  });

  it("closes issue when analysis passes", async () => {
    const commentFn = vi.fn().mockResolvedValue({});
    const updateFn = vi.fn().mockResolvedValue({});
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({ data: [{ number: 5, title: "Lighthouse Performance Alert" }] }),
          createComment: commentFn,
          update: updateFn,
        },
      },
    } as any;

    const analysis: AnalysisResult = {
      urls: [],
      allRegressions: [],
      hasRegressions: false,
      passed: true,
    };

    await manageIssue(mockOctokit, analysis, 3);

    expect(commentFn).toHaveBeenCalled();
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ state: "closed" })
    );
  });

  it("does nothing when analysis passes and no existing issue", async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    } as any;

    const analysis: AnalysisResult = {
      urls: [],
      allRegressions: [],
      hasRegressions: false,
      passed: true,
    };

    await manageIssue(mockOctokit, analysis, 3);
  });
});

describe("ensureLabels", () => {
  beforeEach(() => {
    vi.spyOn(github.context, "repo", "get").mockReturnValue({ owner: "test-owner", repo: "test-repo" });
  });

  it("creates labels when they don't exist", async () => {
    const createLabelFn = vi.fn().mockResolvedValue({});
    const mockOctokit = {
      rest: {
        issues: {
          createLabel: createLabelFn,
        },
      },
    } as any;

    await (await import("./issues")).ensureLabels(mockOctokit);

    expect(createLabelFn).toHaveBeenCalledTimes(2);
  });

  it("handles 422 error (label already exists)", async () => {
    const createLabelFn = vi.fn()
      .mockRejectedValueOnce({ status: 422 }) // First label exists
      .mockResolvedValueOnce({}); // Second label created
    const mockOctokit = {
      rest: {
        issues: {
          createLabel: createLabelFn,
        },
      },
    } as any;

    const result = await (await import("./issues")).ensureLabels(mockOctokit);

    expect(result).toHaveLength(2);
  });
});

describe("findOpenIssue", () => {
  beforeEach(() => {
    vi.spyOn(github.context, "repo", "get").mockReturnValue({ owner: "test-owner", repo: "test-repo" });
  });

  it("returns null on API error", async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockRejectedValue(new Error("API error")),
        },
      },
    } as any;

    const result = await (await import("./issues")).findOpenIssue(mockOctokit);

    expect(result).toBeNull();
  });
});
