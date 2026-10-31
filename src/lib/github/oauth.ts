import { randomBytes, timingSafeEqual } from "node:crypto";
import { GITHUB_SCOPE } from "./config";

/**
 * The browser side of the OAuth web flow is plain redirects. Everything with a secret in it
 * (the client secret, the access token) happens here on the server.
 */

export const STATE_COOKIE = "gh_oauth_state";
export const STATE_MAX_AGE = 10 * 60;

export type GithubOAuthError =
  | "denied"
  | "invalid_state"
  | "exchange_failed"
  | "profile_failed"
  | "not_configured";

export const newState = () => randomBytes(24).toString("base64url");

/**
 * Where the visitor may be sent back to after connecting: a page of the signed-in app, never an
 * address from the outside. Anything else is ignored and the default page is used.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 200) return null;
  return /^\/(dashboard|project)(\/[A-Za-z0-9_-]+)+$/.test(value) ? value : null;
}

/**
 * The cookie holds `state.locale` (and `.next`, the page to return to, in base64url) so the
 * callback can send the visitor back to their language and to the page they started from.
 */
export const packCookie = (state: string, locale: string, next?: string | null) =>
  next ? `${state}.${locale}.${Buffer.from(next).toString("base64url")}` : `${state}.${locale}`;
export function unpackCookie(
  value: string | undefined,
): { state: string; locale: string; next?: string } | null {
  if (!value) return null;
  const [state, locale, encoded, ...extra] = value.split(".");
  if (!state || !locale || extra.length > 0) return null;
  if (encoded === undefined) return { state, locale };
  const next = safeReturnPath(Buffer.from(encoded, "base64url").toString("utf8"));
  return next ? { state, locale, next } : { state, locale };
}

/** Constant-time comparison, so a guessed state leaks nothing. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authorizeUrl(input: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", GITHUB_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

type Fetch = typeof fetch;
const TIMEOUT = 10_000;

export class GithubOAuthFailure extends Error {
  constructor(readonly code: GithubOAuthError) {
    super(code);
  }
}

/** Trades the one-time code for an access token. Provider error bodies are never surfaced. */
export async function exchangeCode(
  input: { code: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchImpl: Fetch = fetch,
): Promise<string> {
  let json: { access_token?: unknown; error?: unknown };
  try {
    const response = await fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!response.ok) throw new GithubOAuthFailure("exchange_failed");
    json = (await response.json()) as typeof json;
  } catch (error) {
    if (error instanceof GithubOAuthFailure) throw error;
    throw new GithubOAuthFailure("exchange_failed");
  }
  if (typeof json.access_token !== "string" || json.access_token.length < 10)
    throw new GithubOAuthFailure("exchange_failed");
  return json.access_token;
}

/** The account the token belongs to. Only the login name is kept. */
export async function fetchLogin(token: string, fetchImpl: Fetch = fetch): Promise<string> {
  try {
    const response = await fetchImpl("https://api.github.com/user", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "saqina-dev",
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!response.ok) throw new GithubOAuthFailure("profile_failed");
    const json = (await response.json()) as { login?: unknown };
    if (typeof json.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(json.login))
      throw new GithubOAuthFailure("profile_failed");
    return json.login;
  } catch (error) {
    if (error instanceof GithubOAuthFailure) throw error;
    throw new GithubOAuthFailure("profile_failed");
  }
}
