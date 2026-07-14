/**
 * OAuth authorization-code flow (optional).
 *
 * Two modes:
 *  - local: spin up a localhost listener, open the browser, capture the
 *    callback automatically.
 *  - SSH / headless: print the authorize URL, let the user open it on their
 *    own machine, then paste back the full redirect URL (`linear auth callback
 *    '<url>'`). No listener is created remotely.
 *
 * The OAuth *application* (client_id/secret/redirect) is a one-time user setup
 * in Linear's settings. We read those from env or ~/.config/linear-cli/oauth.json.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const DEFAULT_SCOPE = "read,write,issues:create,comments:create";

export interface OAuthApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string; // e.g. http://localhost:8788/callback
  /** "app" -> actions are attributed to the application (agent actor). "user" -> the authorizing user. */
  actor?: string;
}

export interface OAuthConfig extends OAuthApp {
  scope: string;
  actor: string;
}

/** Default to the application (agent) actor — that's the whole reason to use OAuth here. */
const DEFAULT_ACTOR = "app";

/** Load the OAuth app config from env or config file. Throws if incomplete. */
export async function loadOAuthApp(): Promise<OAuthConfig> {
  let file: Partial<OAuthApp> = {};
  const path = join(homedir(), ".config", "linear-cli", "oauth.json");
  try {
    file = JSON.parse(await readFile(path, "utf8")) as Partial<OAuthApp>;
  } catch {
    // no config file is fine — env may cover it
  }

  const clientId = process.env.LINEAR_OAUTH_CLIENT_ID || file.clientId;
  const clientSecret = process.env.LINEAR_OAUTH_CLIENT_SECRET || file.clientSecret;
  const redirectUri =
    process.env.LINEAR_OAUTH_REDIRECT_URI || file.redirectUri || "http://localhost:8788/callback";

  if (!clientId || !clientSecret) {
    throw new Error(
      `OAuth app not configured. Set LINEAR_OAUTH_CLIENT_ID / LINEAR_OAUTH_CLIENT_SECRET ` +
        `(and optionally LINEAR_OAUTH_REDIRECT_URI), or write ${path}.`,
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    scope: process.env.LINEAR_OAUTH_SCOPE || DEFAULT_SCOPE,
    actor: process.env.LINEAR_OAUTH_ACTOR || file.actor || DEFAULT_ACTOR,
  };
}

/** Build the authorization URL for the given state (CSRF token). */
export function buildAuthorizeUrl(cfg: OAuthConfig, state: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", state);
  // actor=app makes Linear attribute created issues/comments to the application
  // (the "agent" identity) rather than the authorizing user. "user" opts out.
  if (cfg.actor && cfg.actor !== "user") u.searchParams.set("actor", cfg.actor);
  return u.toString();
}

/** Extract code + state from a pasted redirect URL. Validates against expectedState. */
export function parseCallbackUrl(pasted: string, expectedState?: string): { code: string; state: string } {
  let url: URL;
  try {
    url = new URL(pasted.trim());
  } catch {
    throw new Error(`Not a valid URL: ${pasted.slice(0, 80)}`);
  }
  const err = url.searchParams.get("error");
  if (err) throw new Error(`OAuth provider returned error: ${err} ${url.searchParams.get("error_description") ?? ""}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) throw new Error("Redirect URL has no ?code= parameter");
  if (expectedState && state !== expectedState) {
    throw new Error("OAuth state mismatch — the pasted URL doesn't match this login attempt. Restart `linear auth login --oauth`.");
  }
  return { code, state: state ?? "" };
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
}

/** Exchange an authorization code for an access token. */
export async function exchangeCode(cfg: OAuthConfig, code: string): Promise<TokenResponse> {
  return tokenRequest(cfg, {
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  });
}

/**
 * Exchange a refresh token for a fresh access token — Linear's access tokens
 * expire in ~24h, so without this the user would have to re-authorize daily.
 * The response may include a rotated refresh_token; callers must persist it.
 */
export async function refreshAccessToken(cfg: OAuthConfig, refreshToken: string): Promise<TokenResponse> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
}

async function tokenRequest(cfg: OAuthConfig, params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    ...params,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token ${params.grant_type} failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as TokenResponse;
}

/**
 * Run a one-shot localhost listener that resolves with the captured redirect
 * URL. Used only in the local (browser-reachable) flow. Returns a promise plus
 * the actual port bound.
 */
export function startCallbackListener(
  cfg: OAuthConfig,
): { port: number; done: Promise<string>; stop: () => void } {
  const redirect = new URL(cfg.redirectUri);
  const port = Number(redirect.port) || 8788;
  const path = redirect.pathname || "/callback";

  let resolveFn!: (url: string) => void;
  let rejectFn!: (err: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== path) return new Response("Not found", { status: 404 });
      if (url.searchParams.get("error")) {
        rejectFn(new Error(`OAuth error: ${url.searchParams.get("error")}`));
        return new Response("Authorization failed. You can close this tab.", { status: 400 });
      }
      resolveFn(req.url);
      return new Response("Linear CLI authorized. You can close this tab and return to the terminal.", {
        headers: { "Content-Type": "text/plain" },
      });
    },
  });

  return {
    port,
    done,
    stop: () => server.stop(true),
  };
}
