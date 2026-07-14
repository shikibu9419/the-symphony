/**
 * `linear config <show|set>`
 *
 * Manages the per-repo binding (`.linear-cli.json`): which profile (actor) and
 * which default projects this repo uses. The agent never touches this — it's a
 * one-time human setup per repo.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { keychainGet } from "../auth-store";
import { findGitRoot, findRepoConfig } from "../repo-config";
import { printJson, fail } from "../output";

async function cmdShow(): Promise<void> {
  const cfg = findRepoConfig();
  const keyStored = (await keychainGet(cfg.profile)) !== null;
  printJson({
    ok: true,
    profile: cfg.profile,
    projects: cfg.projects,
    source: cfg.source, // repo | global | default
    config_path: cfg.path ?? null,
    key_stored: keyStored,
    needs_login: !keyStored,
    ...(keyStored ? {} : { hint: `Run: linear auth login --profile ${cfg.profile}` }),
  });
}

function cmdSet(rest: string[]): void {
  const { values } = parseArgs({
    args: rest,
    options: {
      profile: { type: "string" },
      project: { type: "string", multiple: true },
      dir: { type: "string" },
    },
  });

  // Write at the git root by default so the binding covers the whole repo.
  const targetDir = (values.dir as string | undefined) ?? findGitRoot() ?? process.cwd();
  const path = join(targetDir, ".linear-cli.json");

  const existing: Record<string, unknown> = existsSync(path)
    ? (() => {
        try {
          return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        } catch {
          return {};
        }
      })()
    : {};

  const profiles = values.profile as string | undefined;
  const projects = values.project as string[] | undefined;

  const next = {
    ...existing,
    ...(profiles ? { profile: profiles } : {}),
    ...(projects ? { projects } : {}),
  };
  if (!("profile" in next)) {
    fail("No profile set. Pass --profile <name> (e.g. acme-bot).");
  }

  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  printJson({
    ok: true,
    written: path,
    profile: next.profile,
    projects: (next as { projects?: string[] }).projects ?? [],
    next: `linear auth login --profile ${next.profile}   # store this actor's key`,
  });
}

export async function runConfig(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "show":
    case undefined:
      return cmdShow();
    case "set":
    case "init":
      return cmdSet(rest);
    default:
      fail(`Unknown config subcommand: ${sub}. Use show|set.`);
  }
}
