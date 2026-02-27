import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      exclude: ["src/presets/**/*.json"],
      thresholds: {
        perFile: true,
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
