import { describe, it, expect } from "vitest";
import { validatePathTraversal, isPathSafe } from "./utils";

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
});
