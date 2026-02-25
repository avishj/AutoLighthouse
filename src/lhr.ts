import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Profile, AssertionResult } from "./types";

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
