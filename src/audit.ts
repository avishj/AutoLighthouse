import * as core from "@actions/core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import strictMobile from "./presets/strict-mobile.json";
import strictTablet from "./presets/strict-tablet.json";
import strictDesktop from "./presets/strict-desktop.json";
import moderateMobile from "./presets/moderate-mobile.json";
import moderateTablet from "./presets/moderate-tablet.json";
import moderateDesktop from "./presets/moderate-desktop.json";
import relaxedMobile from "./presets/relaxed-mobile.json";
import relaxedTablet from "./presets/relaxed-tablet.json";
import relaxedDesktop from "./presets/relaxed-desktop.json";
import defaultBudget from "./presets/budget.json";

const presets: Record<string, Record<string, unknown>> = {
  "strict-mobile": strictMobile,
  "strict-tablet": strictTablet,
  "strict-desktop": strictDesktop,
  "moderate-mobile": moderateMobile,
  "moderate-tablet": moderateTablet,
  "moderate-desktop": moderateDesktop,
  "relaxed-mobile": relaxedMobile,
  "relaxed-tablet": relaxedTablet,
  "relaxed-desktop": relaxedDesktop,
};

async function run(): Promise<void> {
  try {
    const profile = process.env.INPUT_PROFILE || "mobile";
    const preset = process.env.INPUT_PRESET || "strict";
    const budgets = process.env.INPUT_BUDGETS || "true";

    const key = `${preset}-${profile}`;
    const config = presets[key];
    if (!config) {
      throw new Error(
        `Unknown preset/profile combination: ${preset}/${profile}. ` +
          `Valid presets: strict, moderate, relaxed. Valid profiles: mobile, tablet, desktop.`
      );
    }

    const tmp = tmpdir();
    const configPath = join(tmp, "lighthouserc.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    core.setOutput("config-path", configPath);
    core.info(`Generated lighthouserc at ${configPath} (preset: ${preset}, profile: ${profile})`);

    if (budgets === "false") {
      core.setOutput("budget-path", "");
      core.info("Budgets disabled");
    } else if (budgets === "true") {
      const budgetPath = join(tmp, "budget.json");
      writeFileSync(budgetPath, JSON.stringify(defaultBudget, null, 2));
      core.setOutput("budget-path", budgetPath);
      core.info(`Generated budget at ${budgetPath}`);
    } else {
      core.setOutput("budget-path", budgets);
      core.info(`Using custom budget: ${budgets}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
