---
name: linear
description: >-
  Operate Linear issues/comments from the terminal via the `linear` binary
  (self-contained Linear GraphQL CLI). Use when a task needs to read or write
  Linear: list/get issues, filter by project/state/team, read or post comments,
  change an issue's status, create issues, or run an arbitrary Linear GraphQL
  query. Also use for the 30-min review loop that syncs KAZ-* issues. Triggers:
  "check Linear", "list my in-review issues", "comment on KAZ-38", "move this to
  In Progress", "create a Linear issue", "query Linear". Do NOT use for GitHub
  issues, other trackers, or anything unrelated to Linear. Do NOT try to read,
  print, or handle the Linear API key — the binary keeps it hidden.
user_invocable: true
args: "<subcommand> [args] — e.g. `issue list --state \"In Review\"`, `comment create KAZ-38 --body ...`"
---

# Linear CLI

Machine-wide `linear` binary that talks to `https://api.linear.app/graphql`. The
API key lives in the macOS Keychain and is injected inside the binary — you
never see it, and you must never try to.

All read commands print JSON on stdout. Errors are JSON `{ "ok": false, "error": ... }`.

## Profiles & projects are automatic — don't think about them

Which **actor** (personal key) and which **default projects** apply are bound
per repo in a `.linear-cli.json`. **Just run `linear ...` from inside the repo**
— the binary resolves both from the current directory. You do not pass a key,
you do not pass a profile, and you usually don't pass `--project`.

- `linear issue list --state "In Review"` already scopes to the repo's projects.
- If a command returns `{"ok":false,"needs_login":true,"profile":"X"}`, the repo
  is bound to an actor with no stored key yet. **Stop and tell the human** to run
  `linear auth login --profile X` (a one-time human step). Do not try to supply a key.
- To check what this repo resolves to: `linear config show`.

## 鉄則 (security)

- **The API key is Keychain-managed.** Do NOT read it, print it, put it in an
  env var, or pass it on a command line. Never run `security find-generic-password`.
- Always go through the `linear` binary. Do NOT hit the raw GraphQL endpoint
  with curl/fetch and a hand-supplied token.
- `linear auth status` shows *whoami*, never the key. Use it to confirm auth.

## Setup (one-time, human-run)

```bash
# Bind this repo to an actor + default projects (multiple allowed):
linear config set --profile acme-bot --project Acme --project "Acme Infra"

# Store that actor's Personal API Key (goes to Keychain under the profile):
linear auth login                  # uses the repo's profile; paste key (hidden)
linear auth login --profile acme-bot   # or name it explicitly
echo lin_api_xxx | linear auth login --api-key -   # non-interactive

linear auth status                 # whoami + profile + projects (never the key)
```

Agents normally skip setup entirely — the binding + key already exist.

## Issues

```bash
# List — defaults to the repo's bound projects; filters AND-combine.
linear issue list --state "In Review"                 # repo's projects, In Review
linear issue list --state "In Progress" --limit 20
linear issue list --project Acme                     # override: only this project
linear issue list --project A --project B              # override: multiple (OR)
linear issue list --all-projects --state Todo         # ignore the binding
linear issue list --assignee me@example.com

# Get one (accepts identifier KAZ-38 or a UUID) — includes description + comments
linear issue get KAZ-38

# Create
linear issue create --title "Fix worker crash" --team KAZ \
  --description "Repro: ..." --project Acme --state "Todo"

# Update status (the common one) / title / project
linear issue update KAZ-38 --state "In Progress"
linear issue update KAZ-38 --title "New title"
```

## Comments

```bash
linear comment list KAZ-38                       # oldest-first, JSON
linear comment create KAZ-38 --body "Looks good, merging."
echo "$LONG_MD" | linear comment create KAZ-38 --body -   # body from stdin
```

## Raw GraphQL (escape hatch)

Anything the wrappers don't cover — auth is still injected for you.

```bash
linear graphql '{ viewer { id name } }'
linear graphql 'query($id:String!){ issue(id:$id){ title state{name} } }' \
  --vars '{"id":"KAZ-38"}'
cat query.graphql | linear graphql -            # query from stdin
```

## Notes

- Identifiers (`KAZ-38`) and UUIDs are both accepted wherever an issue ID is expected.
- `--state` / `--project` / `--team` take human names/keys; the binary resolves them to IDs.
- On a fresh machine: build with `bun run build.ts --install` in `~/projects/linear-cli`,
  then `linear auth login`.
