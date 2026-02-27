import { describe, it, expect } from "vitest";
import { validatePathTraversal } from "./utils";

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
