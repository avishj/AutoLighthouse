import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractMetrics, extractUrl, parseLhr, discoverArtifacts } from "./lhr";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("extractMetrics", () => {
  it("extracts all 6 metrics from a valid LHR", () => {
    const lhr = {
      audits: {
        "first-contentful-paint": { numericValue: 1200 },
        "largest-contentful-paint": { numericValue: 2500 },
        "cumulative-layout-shift": { numericValue: 0.03 },
        "total-blocking-time": { numericValue: 50 },
        "speed-index": { numericValue: 1800 },
        interactive: { numericValue: 3500 },
      },
    };
    const metrics = extractMetrics(lhr);
    expect(metrics).toEqual({
      "first-contentful-paint": 1200,
      "largest-contentful-paint": 2500,
      "cumulative-layout-shift": 0.03,
      "total-blocking-time": 50,
      "speed-index": 1800,
      interactive: 3500,
    });
  });

  it("returns undefined for missing audits", () => {
    const lhr = {
      audits: {
        "first-contentful-paint": { numericValue: 1000 },
      },
    };
    const metrics = extractMetrics(lhr);
    expect(metrics["first-contentful-paint"]).toBe(1000);
    expect(metrics["speed-index"]).toBeUndefined();
  });

  it("handles empty audits object", () => {
    const metrics = extractMetrics({ audits: {} });
    expect(metrics["first-contentful-paint"]).toBeUndefined();
  });

  it("handles missing audits key", () => {
    const metrics = extractMetrics({});
    expect(metrics["first-contentful-paint"]).toBeUndefined();
  });
});

describe("extractUrl", () => {
  it("returns requestedUrl when present", () => {
    expect(extractUrl({ requestedUrl: "https://example.com/page" })).toBe("https://example.com/page");
  });

  it("falls back to finalUrl", () => {
    expect(extractUrl({ finalUrl: "https://example.com/final" })).toBe("https://example.com/final");
  });

  it("prefers requestedUrl over finalUrl", () => {
    expect(
      extractUrl({ requestedUrl: "https://example.com/req", finalUrl: "https://example.com/final" }),
    ).toBe("https://example.com/req");
  });

  it("returns empty string when no URL fields", () => {
    expect(extractUrl({})).toBe("");
  });
});

describe("parseLhr", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `lhr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it("parses a valid JSON file", () => {
    const path = join(testDir, "lhr.json");
    writeFileSync(path, JSON.stringify({ audits: {}, requestedUrl: "https://example.com" }));
    const result = parseLhr(path);
    expect(result).toEqual({ audits: {}, requestedUrl: "https://example.com" });
  });

  it("returns null for non-existent file", () => {
    expect(parseLhr(join(testDir, "nope.json"))).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const path = join(testDir, "bad.json");
    writeFileSync(path, "not json");
    expect(parseLhr(path)).toBeNull();
  });
});

describe("discoverArtifacts", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `discover-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  function createArtifactDir(profile: string, lhrFiles: string[] = [], assertions?: unknown[], links?: Record<string, string>) {
    const dir = join(testDir, `autolighthouse-${profile}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "profile.txt"), profile);

    for (const name of lhrFiles) {
      writeFileSync(join(dir, name), JSON.stringify({ audits: {}, requestedUrl: "https://example.com" }));
    }

    if (assertions) {
      writeFileSync(join(dir, "assertion-results.json"), JSON.stringify(assertions));
    }
    if (links) {
      writeFileSync(join(dir, "links.json"), JSON.stringify(links));
    }

    return dir;
  }

  it("discovers artifacts from valid directories", () => {
    createArtifactDir("mobile", ["lhr-0.json", "lhr-1.json"]);
    createArtifactDir("desktop", ["lhr-0.json"]);

    const artifacts = discoverArtifacts(testDir);
    expect(artifacts).toHaveLength(2);

    const mobile = artifacts.find((a) => a.profile === "mobile")!;
    expect(mobile.lhrPaths).toHaveLength(2);

    const desktop = artifacts.find((a) => a.profile === "desktop")!;
    expect(desktop.lhrPaths).toHaveLength(1);
  });

  it("skips directories without profile.txt", () => {
    const dir = join(testDir, "autolighthouse-unknown");
    mkdirSync(dir);
    // No profile.txt

    const artifacts = discoverArtifacts(testDir);
    expect(artifacts).toHaveLength(0);
  });

  it("skips directories with invalid profile", () => {
    const dir = join(testDir, "autolighthouse-invalid");
    mkdirSync(dir);
    writeFileSync(join(dir, "profile.txt"), "smartwatch");

    const artifacts = discoverArtifacts(testDir);
    expect(artifacts).toHaveLength(0);
  });

  it("skips directories not prefixed with autolighthouse-", () => {
    const dir = join(testDir, "other-results");
    mkdirSync(dir);
    writeFileSync(join(dir, "profile.txt"), "mobile");

    const artifacts = discoverArtifacts(testDir);
    expect(artifacts).toHaveLength(0);
  });

  it("reads assertions and links", () => {
    const assertions = [{ auditId: "perf", level: "error", actual: 0.5, expected: 0.9, operator: ">=", passed: false }];
    const links = { "https://example.com": "https://storage.googleapis.com/report" };
    createArtifactDir("mobile", ["lhr-0.json"], assertions, links);

    const artifacts = discoverArtifacts(testDir);
    expect(artifacts[0].assertions).toEqual(assertions);
    expect(artifacts[0].links).toEqual(links);
  });

  it("returns empty assertions/links when files missing", () => {
    createArtifactDir("mobile", ["lhr-0.json"]);

    const artifacts = discoverArtifacts(testDir);
    expect(artifacts[0].assertions).toEqual([]);
    expect(artifacts[0].links).toEqual({});
  });
});
