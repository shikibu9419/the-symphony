#!/usr/bin/env bun
/**
 * linear — self-contained Linear GraphQL CLI.
 *
 * The API key is resolved inside the binary (flag/env/stdin/Keychain) and never
 * printed. Agents call subcommands; they never see or handle the key.
 *
 * Subcommands:
 *   auth     login | logout | status | callback
 *   graphql  <query> [--vars '<json>']      raw passthrough (the core)
 *   issue    list | get | create | update
 *   comment  list | create
 */

import { runAuth } from "./commands/auth";
import { runGraphql } from "./commands/graphql";
import { runIssue } from "./commands/issue";
import { runComment } from "./commands/comment";
import { runConfig } from "./commands/config";
import { LinearError } from "./client";
import { printJson } from "./output";

const HELP = `linear — Linear GraphQL CLI (key stays hidden in the binary)

USAGE
  linear <command> [args] [--api-key <key>|-] [--profile <name>]

COMMANDS
  config show                                resolved profile + projects for this repo
  config set --profile P [--project A --project B ...]
                                             bind this repo to an actor + default projects

  auth login [--oauth] [--api-key <key>|-] [--profile P]
                                             store a key (default: repo's profile -> Keychain)
  auth callback '<redirect URL>'             finish SSH/headless OAuth
  auth logout [--profile P]                  remove stored key
  auth status [--profile P]                  show whoami + profile (never the key)

  graphql '<query>' [--vars '<json>']        raw GraphQL passthrough (auth injected)

  issue list [--project N ...] [--state S] [--team K] [--assignee E] [--limit N] [--all-projects]
  issue get <ID|identifier>
  issue create --title T --team K [--description D] [--project P] [--state S]
  issue update <ID|identifier> [--state S] [--title T] [--description D] [--project P]

  comment list <issueID|identifier> [--limit N]
  comment create <issueID|identifier> --body <md>

PROFILES & PROJECTS (per repo)
  A .linear-cli.json (at/above cwd) binds { profile, projects }. Commands run
  inside the repo transparently use that profile's key (actor) and default to
  its projects — the caller need not know which repo or actor. --project (repeatable)
  or --all-projects override the default; --profile overrides the actor.

KEY RESOLUTION (precedence)
  1. --api-key <key>        2. LINEAR_API_KEY env
  3. --api-key -  (stdin)   4. macOS Keychain (service "linear-cli", account = profile)

All read commands emit JSON on stdout.`;

/**
 * Peel off global options that appear BEFORE the subcommand, e.g.
 * `linear --api-key lin_xxx auth status`. A leading `--api-key <v>` is hoisted
 * into LINEAR_API_KEY (precedence 2) so every command — including `auth status`
 * which takes no flags — sees it. A later `--api-key` after the subcommand
 * still wins (precedence 1).
 */
function extractGlobals(argv: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < argv.length && argv[i].startsWith("-")) {
    const tok = argv[i];
    if (tok === "--api-key" && i + 1 < argv.length) {
      process.env.LINEAR_API_KEY = argv[i + 1];
      i += 2;
    } else if (tok.startsWith("--api-key=")) {
      process.env.LINEAR_API_KEY = tok.slice("--api-key=".length);
      i += 1;
    } else if (tok === "--profile" && i + 1 < argv.length) {
      process.env.LINEAR_PROFILE = argv[i + 1];
      i += 2;
    } else if (tok.startsWith("--profile=")) {
      process.env.LINEAR_PROFILE = tok.slice("--profile=".length);
      i += 1;
    } else {
      break; // leave --help/-h/-v etc. for the dispatcher
    }
  }
  out.push(...argv.slice(i));
  return out;
}

async function main(): Promise<void> {
  const argv = extractGlobals(process.argv.slice(2));
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    printJson({ name: "linear-cli", version: "0.1.0" });
    return;
  }

  switch (cmd) {
    case "auth":
      return runAuth(rest);
    case "graphql":
    case "gql":
      return runGraphql(rest);
    case "issue":
    case "issues":
      return runIssue(rest);
    case "comment":
    case "comments":
      return runComment(rest);
    case "config":
      return runConfig(rest);
    default:
      printJson({ ok: false, error: `Unknown command: ${cmd}. Run \`linear --help\`.` });
      process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof LinearError) {
    printJson({
      ok: false,
      error: err.message,
      ...(err.needsLogin ? { needs_login: true, profile: err.profile } : {}),
      status: err.status,
      errors: err.errors,
    });
  } else {
    printJson({ ok: false, error: (err as Error).message ?? String(err) });
  }
  process.exit(1);
});
