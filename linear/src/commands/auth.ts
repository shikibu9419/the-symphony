/**
 * `linear auth <login|logout|status|callback>`
 *
 * login  : store a Personal API Key in the Keychain (default), or run the
 *          OAuth flow with --oauth.
 * logout : remove the stored key.
 * status : report configured/not — WITHOUT ever printing the key value.
 * callback: finish an SSH/headless OAuth flow by pasting the redirect URL.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { keychainDelete, keychainSet, keychainSetOAuth, readStdin, resolveApiKey } from "../auth-store";
import { graphql } from "../client";
import { printJson, fail } from "../output";
import { findRepoConfig } from "../repo-config";
import {
  buildAuthorizeUrl,
  exchangeCode,
  loadOAuthApp,
  parseCallbackUrl,
  startCallbackListener,
  type OAuthConfig,
} from "../oauth";

const CONFIG_DIR = join(homedir(), ".config", "linear-cli");
const PENDING_PATH = join(CONFIG_DIR, "pending.json");

const VIEWER_QUERY = `query { viewer { id name email } }`;

interface PendingOAuth {
  state: string;
  redirectUri: string;
  scope: string;
  clientId: string;
  profile: string;
}

async function savePending(p: PendingOAuth): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(PENDING_PATH, JSON.stringify(p), { mode: 0o600 });
}

async function loadPending(): Promise<PendingOAuth | null> {
  try {
    return JSON.parse(await readFile(PENDING_PATH, "utf8")) as PendingOAuth;
  } catch {
    return null;
  }
}

const CTRL_C = 3;
const BACKSPACE_A = 8;
const BACKSPACE_B = 127;

/** Read a secret from a TTY without echoing. Falls back to plain stdin. */
async function promptSecret(prompt: string): Promise<string> {
  process.stderr.write(prompt);
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return (await readStdin()).trim();
  }
  return new Promise((resolve) => {
    stdin.setRawMode(true);
    stdin.resume();
    let buf = "";
    const onData = (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      for (const ch of s) {
        const code = ch.charCodeAt(0);
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(buf.trim());
          return;
        } else if (code === CTRL_C) {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        } else if (code === BACKSPACE_A || code === BACKSPACE_B) {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function cmdStatus(profileOverride?: string): Promise<void> {
  const cfg = findRepoConfig();
  const profile = profileOverride ?? cfg.profile;
  const resolved = await resolveApiKey(undefined, profile);
  if (!resolved) {
    printJson({
      ok: true,
      configured: false,
      profile,
      projects: cfg.projects,
      needs_login: true,
      hint: `Run: linear auth login --profile ${profile}`,
    });
    return;
  }
  try {
    const data = await graphql<{ viewer: { id: string; name: string; email: string } }>(VIEWER_QUERY, { profile });
    printJson({
      ok: true,
      configured: true,
      profile,
      projects: cfg.projects,
      source: resolved.source,
      viewer: data.viewer, // whoami — never the key itself
    });
  } catch (err) {
    printJson({
      ok: false,
      configured: true,
      profile,
      source: resolved.source,
      error: `Key present but auth check failed: ${(err as Error).message}`,
    });
    process.exit(1);
  }
}

async function cmdLogout(profileOverride?: string): Promise<void> {
  const profile = profileOverride ?? findRepoConfig().profile;
  const removed = await keychainDelete(profile);
  printJson({ ok: true, profile, removed });
}

async function cmdLoginApiKey(flagValue?: string, profileOverride?: string): Promise<void> {
  const profile = profileOverride ?? findRepoConfig().profile;
  let key: string;
  if (flagValue !== undefined) {
    key = flagValue === "-" ? (await readStdin()).trim() : flagValue.trim();
  } else {
    key = await promptSecret(`Paste Linear Personal API Key for profile "${profile}" (input hidden): `);
  }
  if (!key) fail("No key provided");
  await keychainSet(profile, key);
  // Verify it works — but never print the key.
  try {
    const data = await graphql<{ viewer: { name: string; email: string } }>(VIEWER_QUERY, { apiKey: key, profile });
    printJson({ ok: true, stored: "keychain", profile, viewer: data.viewer });
  } catch (err) {
    printJson({ ok: false, stored: "keychain", profile, error: `Stored but verification failed: ${(err as Error).message}` });
    process.exit(1);
  }
}

async function cmdLoginOAuth(profileOverride?: string, forceManual = false): Promise<void> {
  const profile = profileOverride ?? findRepoConfig().profile;
  const cfg = await loadOAuthApp();
  const state = crypto.randomUUID();
  const authUrl = buildAuthorizeUrl(cfg, state);
  await savePending({ state, redirectUri: cfg.redirectUri, scope: cfg.scope, clientId: cfg.clientId, profile });

  // Under SSH the redirect targets the *laptop's* localhost, which the remote
  // listener can't catch — force the paste-back flow. A localhost listener only
  // makes sense when the browser runs on this same machine.
  const isSsh = !!(process.env.SSH_CONNECTION || process.env.SSH_TTY);
  const canListen = process.stdout.isTTY && process.platform === "darwin" && !isSsh && !forceManual;

  if (canListen) {
    // Local flow: listen + open browser.
    const listener = startCallbackListener(cfg);
    process.stderr.write(`Opening browser for Linear authorization...\nIf it doesn't open, visit:\n${authUrl}\n`);
    Bun.spawn(["open", authUrl]);
    try {
      const redirectUrl = await Promise.race([
        listener.done,
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timed out waiting for callback")), 300_000)),
      ]);
      const { code } = parseCallbackUrl(redirectUrl, state);
      await finishOAuth(cfg, code, profile);
    } finally {
      listener.stop();
    }
    return;
  }

  // SSH / headless flow: print URL, wait for a pasted redirect later.
  printJson({
    ok: true,
    mode: "oauth-manual",
    profile,
    actor: cfg.actor,
    message: "Open this URL in your local browser, approve, then run: linear auth callback '<full redirect URL>'",
    authorize_url: authUrl,
  });
}

async function finishOAuth(cfg: OAuthConfig, code: string, profile: string): Promise<void> {
  const token = await exchangeCode(cfg, code);
  // Store the full bundle (access + refresh + expiry) so resolveApiKey can
  // silently refresh the ~24h access token instead of forcing daily re-auth.
  await keychainSetOAuth(profile, token);
  try {
    const data = await graphql<{ viewer: { name: string; email: string } }>(VIEWER_QUERY, { profile });
    printJson({ ok: true, stored: "keychain", mode: "oauth", profile, viewer: data.viewer });
  } catch (err) {
    printJson({ ok: false, stored: "keychain", mode: "oauth", profile, error: (err as Error).message });
    process.exit(1);
  }
}

async function cmdCallback(pastedUrl?: string): Promise<void> {
  if (!pastedUrl) fail("Usage: linear auth callback '<redirect URL with ?code=...>'");
  const pending = await loadPending();
  if (!pending) fail("No pending OAuth login. Run `linear auth login --oauth` first.");
  const cfg = await loadOAuthApp();
  const { code } = parseCallbackUrl(pastedUrl!, pending!.state);
  await finishOAuth(cfg, code, pending!.profile ?? findRepoConfig().profile);
}

export async function runAuth(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);

  // A leading --profile applies to status/logout too.
  const parseProfile = (args: string[]): string | undefined => {
    const { values } = parseArgs({ args, allowPositionals: true, options: { profile: { type: "string" } }, strict: false });
    return values.profile as string | undefined;
  };

  switch (sub) {
    case "status":
      return cmdStatus(parseProfile(rest));
    case "logout":
      return cmdLogout(parseProfile(rest));
    case "callback":
      return cmdCallback(rest.find((a) => !a.startsWith("-")));
    case "login": {
      const { values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          oauth: { type: "boolean", default: false },
          manual: { type: "boolean", default: false },
          "api-key": { type: "string" },
          profile: { type: "string" },
        },
      });
      const profile = values.profile as string | undefined;
      if (values.oauth) return cmdLoginOAuth(profile, values.manual as boolean);
      return cmdLoginApiKey(values["api-key"] as string | undefined, profile);
    }
    default:
      fail(`Unknown auth subcommand: ${sub ?? "(none)"}. Use login|logout|status|callback.`);
  }
}
