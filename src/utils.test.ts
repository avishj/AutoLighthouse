import { describe, it, expect } from "vitest";
import { validatePathTraversal, isPathSafe, fmt, filterFailedAssertions, countAssertionLevels, buildAssertionTable, buildRegressionsList } from "./utils";
import type { AssertionResult, Regression, MetricKey } from "./types";

describe("isPathSafe", () => {
  it("allows simple relative paths", () => {
    expect(isPathSafe("config.json")).toBe(true);
    expect(isPathSafe("data/file.txt")).toBe(true);
  });

  it("blocks absolute Unix paths", () => {
    expect(isPathSafe("/etc/passwd")).toBe(false);
    expect(isPathSafe("/root/.ssh")).toBe(false);
  });

  it("blocks absolute Windows paths", () => {
    expect(isPathSafe("C:\\Windows")).toBe(false);
    expect(isPathSafe("D:/Users")).toBe(false);
  });

  it("blocks path traversal attempts", () => {
    expect(isPathSafe("../secrets")).toBe(false);
    expect(isPathSafe("foo/../bar")).toBe(false);
    expect(isPathSafe("foo/bar/../../etc")).toBe(false);
  });

  it("allows paths with dots in filenames", () => {
    expect(isPathSafe("file.json")).toBe(true);
    expect(isPathSafe("dir/.hidden")).toBe(true);
    expect(isPathSafe("dir/.../file")).toBe(true);
  });
});

describe("validatePathTraversal", () => {
  it("resolves a safe nested path", () => {
    const result = validatePathTraversal("subdir/file.txt", "/app/data");
    expect(result).toBe("/app/data/subdir/file.txt");
  });

  it("allows direct child of base path", () => {
    const result = validatePathTraversal("config.json", "/app");
    expect(result).toBe("/app/config.json");
  });

  it("blocks path traversal with double dot", () => {
    const result = validatePathTraversal("../secrets", "/app/data");
    expect(result).toBeNull();
  });

  it("blocks traversal to sibling directory", () => {
    const result = validatePathTraversal("../other/file", "/app/data");
    expect(result).toBeNull();
  });

  it("blocks absolute path outside base", () => {
    const result = validatePathTraversal("/etc/passwd", "/app");
    expect(result).toBeNull();
  });

  it("allows exact base path", () => {
    const result = validatePathTraversal(".", "/app/data");
    expect(result).toBe("/app/data");
  });

  it("allows empty path (treated as base)", () => {
    const result = validatePathTraversal("", "/app/data");
    expect(result).toBe("/app/data");
  });

  it("normalizes slashes in user path", () => {
    const result = validatePathTraversal("a/b/c", "/app/data");
    expect(result).toBe("/app/data/a/b/c");
  });

  it("allows paths at root base", () => {
    const result = validatePathTraversal("file.txt", "/");
    expect(result).toBe("/file.txt");
  });
});

describe("fmt", () => {
  it("formats single-digit numbers with 3 decimal places", () => {
    expect(fmt(0)).toBe("0.000");
    expect(fmt(9.999)).toBe("9.999");
  });

  it("formats double-digit numbers with 1 decimal place", () => {
    expect(fmt(10)).toBe("10.0");
    expect(fmt(99.9)).toBe("99.9");
    expect(fmt(100)).toBe("100.0");
  });
});

describe("filterFailedAssertions", () => {
  it("filters to only failed assertions", () => {
    const assertions = [
      { auditId: "a", passed: true },
      { auditId: "b", passed: false },
      { auditId: "c", passed: false },
      { auditId: "d", passed: true },
    ];
    const result = filterFailedAssertions(assertions as any);
    expect(result).toHaveLength(2);
    expect(result.map((a: any) => a.auditId)).toEqual(["b", "c"]);
  });
});

describe("countAssertionLevels", () => {
  it("counts errors and warnings separately", () => {
    const assertions = [
      { level: "error" },
      { level: "error" },
      { level: "warn" },
      { level: "warn" },
      { level: "warn" },
    ];
    const result = countAssertionLevels(assertions as any);
    expect(result).toEqual({ errors: 2, warnings: 3 });
  });
});

describe("buildAssertionTable", () => {
  it("returns empty string for no assertions", () => {
    expect(buildAssertionTable([])).toBe("");
  });

  it("builds markdown table with assertion details", () => {
    const assertions = [
      { auditId: "first-contentful-paint", level: "error", actual: 0.4, expected: 0.9, operator: ">=", passed: false },
    ];
    const result = buildAssertionTable(assertions as any);
    expect(result).toContain("| Audit | Level | Actual | Threshold |");
    expect(result).toContain("first-contentful-paint");
    expect(result).toContain("error");
    expect(result).toContain("0.4");
    expect(result).toContain(">= 0.9");
  });

  it("handles assertions with null values", () => {
    const assertions = [
      { auditId: "some-audit", level: "error", actual: undefined, expected: undefined, operator: undefined, passed: false },
    ];
    const result = buildAssertionTable(assertions as any);
    expect(result).toContain("some-audit");
    expect(result).toContain("—"); // null values replaced with em-dash
  });
});

describe("buildRegressionsList", () => {
  it("returns empty string for no regressions", () => {
    expect(buildRegressionsList([])).toBe("");
  });

  it("builds markdown list with regression details", () => {
    const regressions: Regression[] = [
      { metric: "first-contentful-paint", current: 1500, avg: 1000, percentChange: "50.0%" },
    ];
    const result = buildRegressionsList(regressions);
    expect(result).toContain("**Regressions:**");
    expect(result).toContain("first-contentful-paint");
    expect(result).toContain("1000.0 → 1500.0");
    expect(result).toContain("50.0%");
  });
});
