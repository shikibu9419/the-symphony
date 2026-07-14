/**
 * Per-repository binding.
 *
 * A `.linear-cli.json` at (or above) the current directory declares which
 * `profile` (= which stored personal key / actor) and which default
 * `projects` this repo uses. The agent never has to know either — it just runs
 * `linear ...` inside the repo and the CLI resolves both from cwd.
 *
 *   { "profile": "acme-bot", "projects": ["Acme", "Acme Infra"] }
 *
 * Resolution order: nearest `.linear-cli.json` walking up from cwd ->
 * ~/.config/linear-cli/config.json (global default) -> profile "default".
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const FILE = ".linear-cli.json";
export const DEFAULT_PROFILE = "default";

export interface RepoConfig {
  profile: string;
  projects: string[];
  /** where the binding came from */
  source: "repo" | "global" | "default";
  /** path of the config file, when source !== "default" */
  path?: string;
  /** directory the repo config lives in, when source === "repo" */
  dir?: string;
}

const cache = new Map<string, RepoConfig>();

/** Resolve the effective binding for a starting directory (defaults to cwd). */
export function findRepoConfig(startDir: string = process.cwd()): RepoConfig {
  const cached = cache.get(startDir);
  if (cached) return cached;
  const resolved = resolve(startDir);
  cache.set(startDir, resolved);
  return resolved;
}

function resolve(startDir: string): RepoConfig {
  // A LINEAR_PROFILE env (set by a global --profile, or exported directly)
  // overrides the actor while keeping the repo's declared projects.
  const envProfile = process.env.LINEAR_PROFILE?.trim() || undefined;

  let dir = startDir;
  while (true) {
    const p = join(dir, FILE);
    if (existsSync(p)) {
      const raw = safeRead(p);
      if (raw) {
        return {
          profile: envProfile ?? (typeof raw.profile === "string" && raw.profile.trim() ? raw.profile.trim() : DEFAULT_PROFILE),
          projects: normalizeProjects(raw.projects),
          source: "repo",
          path: p,
          dir,
        };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const global = join(homedir(), ".config", "linear-cli", "config.json");
  if (existsSync(global)) {
    const raw = safeRead(global);
    if (raw) {
      return {
        profile: typeof raw.profile === "string" && raw.profile.trim() ? raw.profile.trim() : DEFAULT_PROFILE,
        projects: normalizeProjects(raw.projects),
        source: "global",
        path: global,
      };
    }
  }

  return { profile: envProfile ?? DEFAULT_PROFILE, projects: [], source: "default" };
}

function safeRead(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeProjects(p: unknown): string[] {
  if (!p) return [];
  if (typeof p === "string") return p.trim() ? [p.trim()] : [];
  if (Array.isArray(p)) return p.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  return [];
}

/** Find the enclosing git repo root (dir containing `.git`), else null. */
export function findGitRoot(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
