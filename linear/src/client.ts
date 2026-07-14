/**
 * Thin GraphQL client for the Linear API.
 *
 * Resolves the key (flag/env/stdin/Keychain) and injects it as the
 * `Authorization` header. Note: a Linear *personal* API key must be sent raw
 * (NO `Bearer ` prefix) or Linear responds 401. OAuth access tokens, on the
 * other hand, do take `Bearer `; we detect that by the `lin_oauth_`-style
 * marker stored alongside (see auth-store) — but personal keys are the default
 * path so we keep it simple and send raw unless the key looks like a bearer.
 */

import { resolveApiKey } from "./auth-store";
import { findRepoConfig } from "./repo-config";

const ENDPOINT = "https://api.linear.app/graphql";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface GraphQLError {
  message: string;
  extensions?: unknown;
  path?: unknown;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: GraphQLError[];
}

export interface LinearErrorExtra {
  needsLogin?: boolean;
  profile?: string;
}

export class LinearError extends Error {
  readonly needsLogin?: boolean;
  readonly profile?: string;
  constructor(
    message: string,
    readonly status?: number,
    readonly errors?: GraphQLError[],
    extra?: LinearErrorExtra,
  ) {
    super(message);
    this.name = "LinearError";
    this.needsLogin = extra?.needsLogin;
    this.profile = extra?.profile;
  }
}

/**
 * OAuth access tokens are stored with a "oauth:" prefix so the client knows to
 * send them as `Bearer`. Personal keys (starting `lin_api_`) are sent raw.
 */
function authHeader(key: string): string {
  if (key.startsWith("oauth:")) return `Bearer ${key.slice("oauth:".length)}`;
  return key;
}

/** Auth selection (raw key and/or stored profile) threaded through helpers and lib. */
export interface LinearOpts {
  apiKey?: string; // raw --api-key value (may be "-" for stdin)
  profile?: string; // force a profile; defaults to the current repo binding
}

export interface QueryOptions extends LinearOpts {
  variables?: Record<string, unknown>;
  timeoutMs?: number;
}

/** Run a GraphQL query/mutation against Linear. Throws LinearError on failure. */
export async function graphql<T = unknown>(
  query: string,
  opts: QueryOptions = {},
): Promise<T> {
  const resolved = await resolveApiKey(opts.apiKey, opts.profile);
  if (!resolved) {
    const profile = opts.profile ?? findRepoConfig().profile;
    throw new LinearError(
      `No Linear key for profile "${profile}". Run: linear auth login --profile ${profile} ` +
        `(or pass --api-key / set LINEAR_API_KEY).`,
      undefined,
      undefined,
      { needsLogin: true, profile },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(resolved.key),
      },
      body: JSON.stringify({ query, variables: opts.variables ?? {} }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new LinearError(`Request to Linear timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
    }
    throw new LinearError(`Network error contacting Linear: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let json: GraphQLResponse<T>;
  try {
    json = JSON.parse(text) as GraphQLResponse<T>;
  } catch {
    throw new LinearError(`Linear returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`, res.status);
  }

  if (json.errors && json.errors.length > 0) {
    throw new LinearError(json.errors.map((e) => e.message).join("; "), res.status, json.errors);
  }
  if (!res.ok) {
    throw new LinearError(`Linear HTTP ${res.status}`, res.status);
  }
  if (json.data === undefined) {
    throw new LinearError("Linear response had no data", res.status);
  }
  return json.data;
}
