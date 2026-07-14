/**
 * Key resolution + secret storage, keyed by *profile*.
 *
 * The whole point: the Linear API key never has to appear in an agent's
 * context. `resolveApiKey()` walks a precedence chain
 * (flag -> env -> stdin -> Keychain[profile]) and returns the raw key. The
 * profile defaults to the current repo's binding (see repo-config), so
 * different repos transparently use different keys / actors. The key value is
 * never printed to stdout/stderr.
 */

import { DEFAULT_PROFILE, findRepoConfig } from "./repo-config";
import { loadOAuthApp, refreshAccessToken, type TokenResponse } from "./oauth";

const SERVICE = "linear-cli";

/** Prefix marking a Keychain slot as an OAuth credential bundle (access +
 * refresh + expiry JSON) rather than a raw personal API key. */
const OAUTH2_PREFIX = "oauth2:";
/** Refresh this many ms before the access token actually expires, so a call
 * never races the boundary. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface StoredOAuth {
  access_token: string;
  refresh_token?: string;
  /** epoch ms; absent means "unknown / never expires" (skip refresh). */
  expires_at?: number;
}

/** Keychain account name for a profile. Profile "default" keeps a stable slot. */
function accountFor(profile: string): string {
  return profile;
}

export interface KeyResolution {
  key: string;
  /** where the key came from — for diagnostics, never includes the value */
  source: "flag" | "env" | "stdin" | "keychain";
  /** the profile that was consulted */
  profile: string;
}

/**
 * Resolve the API key following the documented precedence. `flagValue` is the
 * raw value of `--api-key` (which may be the sentinel "-" meaning "read stdin").
 * `profileOverride` forces a profile; otherwise the current repo binding wins.
 * Returns null when nothing is configured for the resolved profile.
 */
export async function resolveApiKey(flagValue?: string, profileOverride?: string): Promise<KeyResolution | null> {
  const cfg = findRepoConfig();
  const profile = profileOverride ?? cfg.profile ?? DEFAULT_PROFILE;

  // 1 + 3. --api-key <key> or --api-key - (stdin)
  if (flagValue !== undefined) {
    if (flagValue === "-") {
      const key = (await readStdin()).trim();
      if (!key) throw new Error("--api-key - was given but stdin was empty");
      return { key, source: "stdin", profile };
    }
    if (flagValue.trim()) return { key: flagValue.trim(), source: "flag", profile };
  }

  // An explicitly bound profile (a `.linear-cli.json`, `--profile`, or
  // LINEAR_PROFILE) is a stronger statement of "who am I in this repo" than an
  // ambient LINEAR_API_KEY. That env var is frequently NOT a deliberate
  // override: this binary is Bun-compiled and Bun auto-loads the cwd's `.env`,
  // so a repo that keeps its own (unrelated) LINEAR_API_KEY there would
  // silently hijack the bound profile's actor. So a bound profile's Keychain
  // key wins over the env var; env only decides the unbound/default case.
  const bound =
    profileOverride !== undefined || cfg.source !== "default" || !!process.env.LINEAR_PROFILE?.trim();
  if (bound) {
    const stored = await keychainGet(profile);
    if (stored) return { key: await resolveStored(profile, stored), source: "keychain", profile };
  }

  // 2. LINEAR_API_KEY env (direct passing / unbound default)
  const env = process.env.LINEAR_API_KEY?.trim();
  if (env) return { key: env, source: "env", profile };

  // 4. macOS Keychain fallback (default profile, or a bound profile with no
  //    key stored yet falling through to nothing).
  const stored = await keychainGet(profile);
  if (stored) return { key: await resolveStored(profile, stored), source: "keychain", profile };

  return null;
}

/**
 * Turn a raw Keychain value into a usable Authorization value. Personal keys
 * pass through untouched. OAuth bundles (`oauth2:<json>`) are transparently
 * refreshed when the access token is at/near expiry — Linear access tokens
 * last ~24h, so this is what removes the "re-authorize every day" toil — and
 * the refreshed bundle (Linear may rotate the refresh token) is written back.
 * Returns an `oauth:`-prefixed access token so client.ts sends it as Bearer.
 */
async function resolveStored(profile: string, stored: string): Promise<string> {
  if (!stored.startsWith(OAUTH2_PREFIX)) return stored;
  const data = JSON.parse(stored.slice(OAUTH2_PREFIX.length)) as StoredOAuth;

  const needsRefresh =
    !!data.refresh_token && !!data.expires_at && Date.now() >= data.expires_at - REFRESH_SKEW_MS;
  if (!needsRefresh) return `oauth:${data.access_token}`;

  const cfg = await loadOAuthApp();
  const next = await refreshAccessToken(cfg, data.refresh_token!);
  await keychainSetOAuth(profile, next, data.refresh_token);
  return `oauth:${next.access_token}`;
}

/**
 * Persist an OAuth token response as an `oauth2:` bundle. `fallbackRefresh`
 * keeps the prior refresh token when a refresh response omits a rotated one.
 */
export async function keychainSetOAuth(
  profile: string,
  token: TokenResponse,
  fallbackRefresh?: string,
): Promise<void> {
  const bundle: StoredOAuth = {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? fallbackRefresh,
    expires_at: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
  };
  await keychainSet(profile, OAUTH2_PREFIX + JSON.stringify(bundle));
}

/** Read all of stdin as a string. */
export async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const reader = Bun.stdin.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return chunks.join("");
}

/**
 * Store a secret in the login Keychain under (SERVICE, profile). `-U` updates
 * the existing item in place. The key is passed via `-w <value>`; never echoed.
 */
export async function keychainSet(profile: string, key: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error(
      "Keychain storage is only supported on macOS. Use --api-key or LINEAR_API_KEY instead.",
    );
  }
  const proc = Bun.spawn(
    ["security", "add-generic-password", "-s", SERVICE, "-a", accountFor(profile), "-w", key, "-U"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`Keychain write failed: ${err.trim() || `exit ${code}`}`);
  }
}

/** Read the stored secret for a profile, or null if absent. Never logs the value. */
export async function keychainGet(profile: string): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  const proc = Bun.spawn(
    ["security", "find-generic-password", "-s", SERVICE, "-a", accountFor(profile), "-w"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) return null; // item not found -> exit 44
  const out = (await new Response(proc.stdout).text()).trim();
  return out || null;
}

/** Delete the stored secret for a profile. Returns true if something was removed. */
export async function keychainDelete(profile: string): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const proc = Bun.spawn(
    ["security", "delete-generic-password", "-s", SERVICE, "-a", accountFor(profile)],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  return code === 0;
}
