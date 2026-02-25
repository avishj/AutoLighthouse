import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputs: Record<string, string> = {};
const logs: string[] = [];
let failedMsg: string | undefined;

vi.mock("@actions/core", () => ({
  setOutput: (k: string, v: string) => { outputs[k] = v; },
  info: (msg: string) => { logs.push(msg); },
  setFailed: (msg: string) => { failedMsg = msg; },
}));

const ENV_KEYS = ["INPUT_PROFILE", "INPUT_PRESET", "INPUT_BUDGETS"] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("audit", () => {
  beforeEach(() => {
    clearEnv();
    Object.keys(outputs).forEach((k) => delete outputs[k]);
    logs.length = 0;
    failedMsg = undefined;
  });

  async function runAudit() {
    // Re-import to re-execute the module's run()
    vi.resetModules();
    await import("./audit");
    // Give the async run() a tick to complete
    await new Promise((r) => setTimeout(r, 50));
  }

  it("generates config for default preset/profile (strict/mobile)", async () => {
    await runAudit();

    expect(outputs["config-path"]).toBeDefined();
    expect(existsSync(outputs["config-path"])).toBe(true);
    const config = JSON.parse(readFileSync(outputs["config-path"], "utf-8"));
    expect(config).toBeDefined();

    expect(outputs["budget-path"]).toBeDefined();
    expect(existsSync(outputs["budget-path"])).toBe(true);
  });

  it("generates config for each valid preset/profile combination", async () => {
    const presets = ["strict", "moderate", "relaxed"];
    const profiles = ["mobile", "tablet", "desktop"];

    for (const preset of presets) {
      for (const profile of profiles) {
        process.env.INPUT_PRESET = preset;
        process.env.INPUT_PROFILE = profile;
        await runAudit();

        expect(outputs["config-path"]).toBeDefined();
        expect(existsSync(outputs["config-path"])).toBe(true);
        expect(failedMsg).toBeUndefined();
      }
    }
  });

  it("fails on invalid preset/profile combination", async () => {
    process.env.INPUT_PRESET = "ultra";
    process.env.INPUT_PROFILE = "mobile";
    await runAudit();

    expect(failedMsg).toContain("Unknown preset/profile combination");
  });

  it("disables budgets when set to false", async () => {
    process.env.INPUT_BUDGETS = "false";
    await runAudit();

    expect(outputs["budget-path"]).toBe("");
  });

  it("uses custom budget path", async () => {
    process.env.INPUT_BUDGETS = "/custom/budget.json";
    await runAudit();

    expect(outputs["budget-path"]).toBe("/custom/budget.json");
  });

  it("generates default budget when set to true", async () => {
    process.env.INPUT_BUDGETS = "true";
    await runAudit();

    expect(outputs["budget-path"]).toBeDefined();
    expect(outputs["budget-path"]).toContain("budget.json");
    expect(existsSync(outputs["budget-path"])).toBe(true);

    const budget = JSON.parse(readFileSync(outputs["budget-path"], "utf-8"));
    expect(Array.isArray(budget)).toBe(true);
  });
});
