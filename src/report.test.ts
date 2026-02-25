import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReportConfig, Metrics, AnalysisResult, History } from "./types";

// ── Shared state captured by mocks ──────────────────────────────────────

const outputs: Record<string, string> = {};
const warnings: string[] = [];
const infos: string[] = [];
let failedMsg: string | undefined;
let summaryWritten: string | undefined;
const configOverrides: Partial<ReportConfig> = {};

// ── vi.fn() references shared across vi.mock and vi.doMock ─────────────

const mockDiscoverArtifacts = vi.fn().mockReturnValue([]);
const mockParseLhr = vi.fn().mockReturnValue(null);
const mockExtractMetrics = vi.fn().mockReturnValue({});
const mockExtractUrl = vi.fn().mockReturnValue("");
const mockDetectRegressions = vi.fn().mockReturnValue([]);
const mockLoadHistory = vi.fn().mockReturnValue({ version: 1, lastUpdated: "", paths: {} });
const mockSaveHistory = vi.fn();
const mockCleanupStalePaths = vi.fn().mockReturnValue([]);
const mockManageIssue = vi.fn().mockResolvedValue(undefined);
const mockBuildSummary = vi.fn().mockReturnValue("## ✅ Lighthouse Report\n");

// ── Helpers ─────────────────────────────────────────────────────────────

function resetState() {
  Object.keys(outputs).forEach((k) => delete outputs[k]);
  warnings.length = 0;
  infos.length = 0;
  failedMsg = undefined;
  summaryWritten = undefined;
  Object.keys(configOverrides).forEach((k) => delete (configOverrides as Record<string, unknown>)[k]);
}

function applyDoMocks() {
  vi.doMock("@actions/core", () => ({
    setOutput: (k: string, v: string) => { outputs[k] = v; },
    setFailed: (msg: string) => { failedMsg = msg; },
    warning: (msg: string) => { warnings.push(msg); },
    info: (msg: string) => { infos.push(msg); },
    summary: {
      addRaw: (md: string) => {
        summaryWritten = md;
        return { write: vi.fn().mockResolvedValue(undefined) };
      },
    },
  }));

  vi.doMock("@actions/github", () => ({
    getOctokit: vi.fn(() => ({})),
    context: { repo: { owner: "test-owner", repo: "test-repo" } },
  }));

  vi.doMock("./config", () => ({
    parseConfig: (): ReportConfig => ({
      resultsPath: ".autolighthouse-results",
      regressionThreshold: 10,
      consecutiveFailLimit: 3,
      failOn: "error" as const,
      createIssues: false,
      historyPath: "",
      cleanupStalePaths: false,
      stalePathDays: 30,
      maxHistoryRuns: 100,
      githubToken: "",
      ...configOverrides,
    }),
  }));

  vi.doMock("./lhr", () => ({
    discoverArtifacts: (...args: unknown[]) => mockDiscoverArtifacts(...args),
    parseLhr: (...args: unknown[]) => mockParseLhr(...args),
    extractMetrics: (...args: unknown[]) => mockExtractMetrics(...args),
    extractUrl: (...args: unknown[]) => mockExtractUrl(...args),
  }));

  vi.doMock("./regression", () => ({
    detectRegressions: (...args: unknown[]) => mockDetectRegressions(...args),
  }));

  vi.doMock("./history", () => ({
    loadHistory: (...args: unknown[]) => mockLoadHistory(...args),
    saveHistory: (...args: unknown[]) => mockSaveHistory(...args),
    cleanupStalePaths: (...args: unknown[]) => mockCleanupStalePaths(...args),
  }));

  vi.doMock("./issues", () => ({
    manageIssue: (...args: unknown[]) => mockManageIssue(...args),
  }));

  vi.doMock("./summary", () => ({
    buildSummary: (...args: unknown[]) => mockBuildSummary(...args),
  }));
}

async function runReport(setup?: () => void) {
  vi.resetModules();
  vi.clearAllMocks();
  applyDoMocks();
  if (setup) setup();
  await import("./report");
  await new Promise((r) => setTimeout(r, 50));
}

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    "first-contentful-paint": 1200,
    "largest-contentful-paint": 2400,
    "cumulative-layout-shift": 0.08,
    "total-blocking-time": 150,
    "speed-index": 1800,
    interactive: 3500,
    ...overrides,
  };
}

/** Set up mocks so discoverArtifacts returns realistic artifact structures. */
function setupArtifacts(
  artifacts: Array<{
    profile: "mobile" | "tablet" | "desktop";
    urls: Array<{ url: string; metrics?: Partial<Metrics> }>;
    assertions?: Array<{ auditId: string; level: "error" | "warn"; actual: number; expected: number; operator: string; passed: boolean; url?: string }>;
    links?: Record<string, string>;
  }>,
) {
  const result = artifacts.map((a) => ({
    profile: a.profile,
    lhrPaths: a.urls.map((_, i) => `/fake/lhr-${i}.json`),
    assertions: a.assertions ?? [],
    links: a.links ?? {},
  }));

  mockDiscoverArtifacts.mockReturnValue(result);

  // Each parseLhr call returns a fake LHR
  const lhrQueue: Record<string, unknown>[] = [];
  for (const a of artifacts) {
    for (const u of a.urls) {
      lhrQueue.push({ requestedUrl: u.url, audits: {} });
    }
  }
  let lhrIdx = 0;
  mockParseLhr.mockImplementation(() => lhrQueue[lhrIdx++] ?? null);

  // extractUrl pulls from the LHR
  mockExtractUrl.mockImplementation((lhr: Record<string, unknown>) => lhr.requestedUrl as string || "");

  // extractMetrics returns per-URL metrics
  const metricsQueue: Metrics[] = [];
  for (const a of artifacts) {
    for (const u of a.urls) {
      metricsQueue.push(makeMetrics(u.metrics));
    }
  }
  let metricsIdx = 0;
  mockExtractMetrics.mockImplementation(() => metricsQueue[metricsIdx++] ?? makeMetrics());
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("report", () => {
  beforeEach(() => {
    resetState();
  });

  // ── Early exit ──────────────────────────────────────────────────────

  describe("when no audit artifacts exist", () => {
    it("warns the user and produces no outputs", async () => {
      await runReport();

      expect(warnings).toContain("No audit artifacts found — nothing to analyze.");
      expect(outputs["results"]).toBeUndefined();
      expect(outputs["regressions"]).toBeUndefined();
    });

    it("does not attempt to write a summary or save history", async () => {
      configOverrides.historyPath = ".lighthouse/history.json";
      await runReport();

      expect(summaryWritten).toBeUndefined();
      expect(mockSaveHistory).not.toHaveBeenCalled();
    });
  });

  // ── Core analysis pipeline ────────────────────────────────────────

  describe("single URL audited on one profile", () => {
    it("produces results output with url, pathname, and metrics", async () => {
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://shop.example.com/products", metrics: { "first-contentful-paint": 1100 } }],
        }]);
      });

      const results = JSON.parse(outputs["results"]);
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe("https://shop.example.com/products");
      expect(results[0].pathname).toBe("/products");
      expect(results[0].profiles).toHaveLength(1);
      expect(results[0].profiles[0].profile).toBe("mobile");
    });

    it("marks the run as passed when no assertions fail and no regressions detected", async () => {
      await runReport(() => {
        setupArtifacts([{
          profile: "desktop",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      const results = JSON.parse(outputs["results"]);
      expect(results[0].passed).toBe(true);
      expect(results[0].profiles[0].passed).toBe(true);
      expect(outputs["has-regressions"]).toBe("false");
    });
  });

  describe("multiple URLs across multiple profiles", () => {
    it("groups profiles under their respective URLs", async () => {
      await runReport(() => {
        setupArtifacts([
          {
            profile: "mobile",
            urls: [
              { url: "https://example.com/", metrics: { "first-contentful-paint": 1300 } },
              { url: "https://example.com/about", metrics: { "first-contentful-paint": 1100 } },
            ],
          },
          {
            profile: "desktop",
            urls: [
              { url: "https://example.com/", metrics: { "first-contentful-paint": 800 } },
              { url: "https://example.com/about", metrics: { "first-contentful-paint": 700 } },
            ],
          },
        ]);
      });

      const results = JSON.parse(outputs["results"]);
      expect(results).toHaveLength(2);

      const home = results.find((u: { pathname: string }) => u.pathname === "/");
      expect(home.profiles).toHaveLength(2);
      expect(home.profiles.map((p: { profile: string }) => p.profile).sort()).toEqual(["desktop", "mobile"]);

      const about = results.find((u: { pathname: string }) => u.pathname === "/about");
      expect(about.profiles).toHaveLength(2);
    });
  });

  // ── Regression detection integration ──────────────────────────────

  describe("regression detection", () => {
    it("reports regressions when metrics exceed historical baseline", async () => {
      configOverrides.historyPath = ".lighthouse/history.json";
      await runReport(() => {
        mockLoadHistory.mockReturnValue({
          version: 1,
          lastUpdated: "",
          paths: {
            "mobile:/": {
              consecutiveFailures: 0,
              lastSeen: new Date().toISOString(),
              runs: [
                { metrics: { "first-contentful-paint": 950 }, timestamp: "2025-01-01T00:00:00Z" },
                { metrics: { "first-contentful-paint": 1050 }, timestamp: "2025-01-02T00:00:00Z" },
              ],
            },
          },
        });
        mockDetectRegressions.mockReturnValue([
          { metric: "first-contentful-paint", current: 1400, avg: 1000, percentChange: "40.0%" },
        ]);
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/", metrics: { "first-contentful-paint": 1400 } }],
        }]);
      });

      const regressions = JSON.parse(outputs["regressions"]);
      expect(regressions).toHaveLength(1);
      expect(regressions[0].url).toBe("https://example.com/");
      expect(regressions[0].profile).toBe("mobile");
      expect(regressions[0].regressions[0].metric).toBe("first-contentful-paint");
      expect(outputs["has-regressions"]).toBe("true");
    });

    it("does not flag regressions when no history is configured", async () => {
      configOverrides.historyPath = "";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockDetectRegressions).not.toHaveBeenCalled();
      expect(outputs["has-regressions"]).toBe("false");
    });
  });

  // ── History lifecycle ─────────────────────────────────────────────

  describe("history management", () => {
    it("saves updated history after processing artifacts", async () => {
      configOverrides.historyPath = ".lighthouse/history.json";
      await runReport(() => {
        mockLoadHistory.mockReturnValue({ version: 1, lastUpdated: "", paths: {} });
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockSaveHistory).toHaveBeenCalledOnce();
      expect(mockSaveHistory.mock.calls[0][0]).toBe(".lighthouse/history.json");
    });

    it("does not save history when historyPath is empty", async () => {
      configOverrides.historyPath = "";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockSaveHistory).not.toHaveBeenCalled();
    });

    it("increments consecutive failures when a profile has regressions", async () => {
      configOverrides.historyPath = ".lighthouse/history.json";
      const history = {
        version: 1 as const,
        lastUpdated: "",
        paths: {
          "mobile:/": {
            consecutiveFailures: 2,
            lastSeen: "2025-01-01T00:00:00Z",
            runs: [
              { metrics: { "first-contentful-paint": 1000 }, timestamp: "2025-01-01T00:00:00Z" },
              { metrics: { "first-contentful-paint": 1000 }, timestamp: "2025-01-02T00:00:00Z" },
            ],
          },
        },
      };
      await runReport(() => {
        mockLoadHistory.mockReturnValue(history);
        mockDetectRegressions.mockReturnValue([
          { metric: "first-contentful-paint", current: 1500, avg: 1000, percentChange: "50.0%" },
        ]);
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/", metrics: { "first-contentful-paint": 1500 } }],
        }]);
      });

      expect(history.paths["mobile:/"].consecutiveFailures).toBe(3);
    });

    it("resets consecutive failures to zero when a profile passes", async () => {
      configOverrides.historyPath = ".lighthouse/history.json";
      const history = {
        version: 1 as const,
        lastUpdated: "",
        paths: {
          "desktop:/blog": {
            consecutiveFailures: 4,
            lastSeen: "2025-01-01T00:00:00Z",
            runs: [
              { metrics: { "first-contentful-paint": 1000 }, timestamp: "2025-01-01T00:00:00Z" },
              { metrics: { "first-contentful-paint": 1000 }, timestamp: "2025-01-02T00:00:00Z" },
            ],
          },
        },
      };
      await runReport(() => {
        mockLoadHistory.mockReturnValue(history);
        mockDetectRegressions.mockReturnValue([]);
        setupArtifacts([{
          profile: "desktop",
          urls: [{ url: "https://example.com/blog" }],
        }]);
      });

      expect(history.paths["desktop:/blog"].consecutiveFailures).toBe(0);
    });

    it("triggers stale path cleanup when configured", async () => {
      configOverrides.historyPath = ".lighthouse/history.json";
      configOverrides.cleanupStalePaths = true;
      configOverrides.stalePathDays = 14;
      await runReport(() => {
        mockCleanupStalePaths.mockReturnValue(["tablet:/old-page"]);
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockCleanupStalePaths).toHaveBeenCalledOnce();
      expect(infos.some((m) => m.includes("stale") && m.includes("tablet:/old-page"))).toBe(true);
    });
  });

  // ── Step summary ──────────────────────────────────────────────────

  describe("step summary", () => {
    it("writes the summary markdown to GitHub Actions", async () => {
      await runReport(() => {
        mockBuildSummary.mockReturnValue("## ✅ All good\n");
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockBuildSummary).toHaveBeenCalledOnce();
      expect(summaryWritten).toBe("## ✅ All good\n");
    });

    it("passes the full analysis structure to buildSummary", async () => {
      await runReport(() => {
        setupArtifacts([
          { profile: "mobile", urls: [{ url: "https://example.com/" }] },
          { profile: "desktop", urls: [{ url: "https://example.com/" }] },
        ]);
      });

      const analysis: AnalysisResult = mockBuildSummary.mock.calls[0][0];
      expect(analysis.urls).toHaveLength(1);
      expect(analysis.urls[0].profiles).toHaveLength(2);
    });
  });

  // ── Issue management ──────────────────────────────────────────────

  describe("issue management", () => {
    it("creates/manages issues when enabled with a token", async () => {
      configOverrides.createIssues = true;
      configOverrides.githubToken = "ghp_test123";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockManageIssue).toHaveBeenCalledOnce();
    });

    it("warns when issues are enabled but no token is provided", async () => {
      configOverrides.createIssues = true;
      configOverrides.githubToken = "";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockManageIssue).not.toHaveBeenCalled();
      expect(warnings.some((w) => w.includes("no github-token"))).toBe(true);
    });

    it("does not attempt issue management when disabled", async () => {
      configOverrides.createIssues = false;
      configOverrides.githubToken = "ghp_test123";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(mockManageIssue).not.toHaveBeenCalled();
    });

    it("does not crash if issue management throws", async () => {
      configOverrides.createIssues = true;
      configOverrides.githubToken = "ghp_test123";
      await runReport(() => {
        mockManageIssue.mockRejectedValue(new Error("API rate limit exceeded"));
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
        }]);
      });

      expect(warnings.some((w) => w.includes("API rate limit exceeded"))).toBe(true);
      expect(outputs["results"]).toBeDefined();
    });
  });

  // ── Fail-on logic ────────────────────────────────────────────────

  describe("fail-on behavior", () => {
    it("fails the action when fail-on=error and an assertion error exists", async () => {
      configOverrides.failOn = "error";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
          assertions: [
            { auditId: "first-contentful-paint", level: "error", actual: 0.3, expected: 0.9, operator: ">=", passed: false },
          ],
        }]);
      });

      expect(failedMsg).toContain("assertion errors");
    });

    it("does not fail when fail-on=error and only warnings exist", async () => {
      configOverrides.failOn = "error";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
          assertions: [
            { auditId: "speed-index", level: "warn", actual: 0.6, expected: 0.8, operator: ">=", passed: false },
          ],
        }]);
      });

      expect(failedMsg).toBeUndefined();
    });

    it("fails when fail-on=warn and warnings exist", async () => {
      configOverrides.failOn = "warn";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
          assertions: [
            { auditId: "speed-index", level: "warn", actual: 0.6, expected: 0.8, operator: ">=", passed: false },
          ],
        }]);
      });

      expect(failedMsg).toContain("assertion failures");
    });

    it("never fails the action when fail-on=never regardless of errors", async () => {
      configOverrides.failOn = "never";
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
          assertions: [
            { auditId: "first-contentful-paint", level: "error", actual: 0.2, expected: 0.9, operator: ">=", passed: false },
          ],
        }]);
      });

      expect(failedMsg).toBeUndefined();
    });
  });

  // ── Report links ──────────────────────────────────────────────────

  describe("report links", () => {
    it("attaches report links to profiles when available from artifacts", async () => {
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [{ url: "https://example.com/" }],
          links: { "https://example.com/": "https://storage.googleapis.com/lh-report.html" },
        }]);
      });

      const results = JSON.parse(outputs["results"]);
      expect(results[0].profiles[0].reportLink).toBe("https://storage.googleapis.com/lh-report.html");
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("skips LHR files that fail to parse", async () => {
      await runReport(() => {
        mockDiscoverArtifacts.mockReturnValue([{
          profile: "mobile",
          lhrPaths: ["/fake/lhr-0.json", "/fake/lhr-bad.json"],
          assertions: [],
          links: {},
        }]);
        let callCount = 0;
        mockParseLhr.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return { requestedUrl: "https://example.com/", audits: {} };
          return null;
        });
        mockExtractUrl.mockImplementation((lhr: Record<string, unknown>) => lhr.requestedUrl as string || "");
        mockExtractMetrics.mockReturnValue(makeMetrics());
      });

      const results = JSON.parse(outputs["results"]);
      expect(results).toHaveLength(1);
    });

    it("skips LHR files with no extractable URL", async () => {
      await runReport(() => {
        mockDiscoverArtifacts.mockReturnValue([{
          profile: "mobile",
          lhrPaths: ["/fake/lhr-0.json"],
          assertions: [],
          links: {},
        }]);
        mockParseLhr.mockReturnValue({ audits: {} });
        mockExtractUrl.mockReturnValue("");
      });

      const results = JSON.parse(outputs["results"]);
      expect(results).toHaveLength(0);
    });

    it("handles assertion failures scoped to specific URLs", async () => {
      await runReport(() => {
        setupArtifacts([{
          profile: "mobile",
          urls: [
            { url: "https://example.com/" },
            { url: "https://example.com/slow" },
          ],
          assertions: [
            { auditId: "first-contentful-paint", level: "error", actual: 0.3, expected: 0.9, operator: ">=", passed: false, url: "https://example.com/slow" },
          ],
        }]);
      });

      const results = JSON.parse(outputs["results"]);
      const home = results.find((u: { pathname: string }) => u.pathname === "/");
      const slow = results.find((u: { pathname: string }) => u.pathname === "/slow");

      expect(slow.profiles[0].passed).toBe(false);
      expect(home.profiles[0].passed).toBe(true);
    });
  });
});
