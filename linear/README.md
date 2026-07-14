# linear-cli

Self-contained **Linear GraphQL CLI** compiled to a single binary. Built to kill
the OAuth re-auth loop of Linear's remote MCP: it talks to
`https://api.linear.app/graphql` directly with a long-lived Personal API Key,
and **keeps that key out of any agent's context** (resolved inside the binary,
stored in the macOS Keychain, never printed).

## Why

Linear's official remote MCP (`mcp.linear.app/mcp`) is OAuth-only with
short-lived tokens — periodic browser re-auth, and a static `Authorization`
header disables the OAuth fallback and 401-loops. This CLI removes that whole
class of problem: personal keys don't expire, and over SSH you paste the key
once.

## Design goals

- **From MCP to direct GraphQL.** Raw passthrough (`linear graphql`) reaches
  everything; thin wrappers cover the common issue/comment operations.
- **Key hidden from agents.** Agents call subcommands; the key is resolved in
  `client.ts` (flag → env → stdin → Keychain) and never emitted to stdout/stderr.
- **Machine-wide.** One compiled binary symlinked into `~/.local/bin/linear`.
- **Direct key passing too.** `--api-key`, `LINEAR_API_KEY`, or stdin for
  one-shot / CI / SSH use — Keychain isn't required.

## Build & install

```bash
bun build --compile --outfile ~/.local/bin/linear src/index.ts   # self-contained binary
```

Requires [Bun](https://bun.sh) to build; the output binary is self-contained.
（the-symphony monorepo では `install.sh` がこれをやる。）

## Profiles & projects (per repo)

Each repo is bound to a **profile** (which stored key / actor to use) and a set
of **default projects** via a `.linear-cli.json` at (or above) the working
directory:

```json
{ "profile": "acme-bot", "projects": ["Acme", "Acme Infra"] }
```

Commands run inside the repo transparently use that profile's key and default
to its projects — an agent never has to know which repo or actor it's in. This
is how "different actor per repo" works: bind each repo to a different profile,
and store each profile's key once.

```bash
linear config set --profile acme-bot --project Acme --project "Acme Infra"
linear config show          # resolved profile + projects + key_stored for this repo
```

- `--project` (repeatable) overrides the bound projects; `--all-projects` ignores them.
- `--profile <name>` (global) overrides the actor for one call.
- A command in a bound-but-not-logged-in repo returns
  `{"ok":false,"needs_login":true,"profile":"X"}` → run `linear auth login --profile X`.

## Auth

```bash
linear auth login                         # uses the repo's profile; paste key (hidden)
linear auth login --profile acme-bot     # name the profile explicitly
echo lin_api_xxx | linear auth login --api-key -   # non-interactive
linear auth status                        # whoami + profile — never prints the key
linear auth logout [--profile X]
```

Key resolution precedence (every command):

1. `--api-key <key>`   2. `LINEAR_API_KEY` env   3. `--api-key -` (stdin)   4. macOS Keychain (account = profile)

### OAuth / Agent actor (optional)

A Personal API Key always acts as *its owner*. To post/act as a distinct **agent
identity** (the application itself, not a user), use OAuth with `actor=app`.

One-time: register an OAuth application in Linear (Settings → API → OAuth
applications) with redirect `http://localhost:8788/callback`, then configure the
CLI via env or `~/.config/linear-cli/oauth.json`:

```json
{ "clientId": "...", "clientSecret": "...", "redirectUri": "http://localhost:8788/callback", "actor": "app" }
```

```bash
linear auth login --oauth --profile acme-agent   # actor=app by default (agent identity)
# local (browser on this machine): opens browser, captures callback automatically.
# SSH/headless (auto-detected, or force with --manual): prints the authorize URL;
# open it on your machine, approve, then paste the redirect back:
linear auth callback 'http://localhost:8788/callback?code=...&state=...'
```

`actor` can be overridden per app (`"user"` to act as the authorizing user, or a
value Linear expects) via `LINEAR_OAUTH_ACTOR` / the config file. A full
mentionable/assignable Agent additionally needs the app's agent capability +
`app:*` scopes (`LINEAR_OAUTH_SCOPE`) enabled in Linear.

## Usage

```bash
linear issue list --project Acme --state "In Review"
linear issue get KAZ-38
linear issue update KAZ-38 --state "In Progress"
linear comment list KAZ-38
linear comment create KAZ-38 --body "done"
linear graphql '{ viewer { id name } }'
```

All read commands emit JSON. See `skills/linear/SKILL.md` for the agent-facing reference.

## Layout

```
src/
  index.ts          entry + subcommand dispatch (node:util parseArgs)
  repo-config.ts    per-repo .linear-cli.json resolution (profile + projects)
  auth-store.ts     key resolution + Keychain read/write, keyed by profile
  client.ts         fetch to Linear GraphQL, Authorization injection
  oauth.ts          authorization-code flow (local listener + SSH paste)
  linear-helpers.ts identifier/UUID/state/team/project resolution
  commands/         auth, config, graphql, issue, comment
skills/linear/      SKILL.md (symlink to ~/.claude/skills/linear for machine-wide use)
```
