import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Profile, AssertionResult, Metrics } from "./types";
import { METRIC_KEYS } from "./types";

/** Metadata and LHR file paths for a single profile's audit results. */
export interface ProfileArtifact {
  profile: Profile;
  lhrPaths: string[];
  assertions: AssertionResult[];
  links: Record<string, string>;
}

/** Discover all profile artifact directories under the results root. */
export function discoverArtifacts(resultsPath: string): ProfileArtifact[] {
  const entries = readdirSync(resultsPath, { withFileTypes: true });
  const artifacts: ProfileArtifact[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("autolighthouse-")) continue;

    const dir = join(resultsPath, entry.name);
    const profile = readProfile(dir);
    if (!profile) continue;

    artifacts.push({
      profile,
      lhrPaths: findLhrFiles(dir),
      assertions: readAssertions(dir),
      links: readLinks(dir),
    });
  }

  return artifacts;
}

function readProfile(dir: string): Profile | null {
  const path = join(dir, "profile.txt");
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf-8").trim();
  if (value === "mobile" || value === "tablet" || value === "desktop") return value;
  return null;
}

function findLhrFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith("lhr-") && f.endsWith(".json"))
    .map((f) => join(dir, f));
}

function readAssertions(dir: string): AssertionResult[] {
  const path = join(dir, "assertion-results.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Extract the 6 core metrics from a Lighthouse Result JSON object. */
export function extractMetrics(lhr: Record<string, unknown>): Metrics {
  const audits = (lhr.audits ?? {}) as Record<string, { numericValue?: number }>;
  const metrics = {} as Metrics;
  for (const key of METRIC_KEYS) {
    metrics[key] = audits[key]?.numericValue;
  }
  return metrics;
}

/** Extract the requested URL from an LHR object. */
export function extractUrl(lhr: Record<string, unknown>): string {
  return (lhr.requestedUrl as string) || (lhr.finalUrl as string) || "";
}

/** Parse an LHR JSON file. Returns null on failure. */
export function parseLhr(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function readLinks(dir: string): Record<string, string> {
  const path = join(dir, "links.json");
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}
