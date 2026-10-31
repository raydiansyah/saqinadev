import { describe, expect, it } from "vitest";
import {
  appOrigin,
  GITHUB_SCOPE,
  githubCallbackUrl,
  isGithubConnectEnabled,
} from "@/lib/github/config";
import {
  authorizeUrl,
  exchangeCode,
  fetchLogin,
  newState,
  packCookie,
  safeReturnPath,
  sameState,
  unpackCookie,
} from "@/lib/github/oauth";

const json = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("github connect config", () => {
  it("needs both the client id and the secret", () => {
    expect(isGithubConnectEnabled({})).toBe(false);
    expect(isGithubConnectEnabled({ GITHUB_OAUTH_CLIENT_ID: "id" })).toBe(false);
    expect(isGithubConnectEnabled({ GITHUB_OAUTH_CLIENT_SECRET: "s" })).toBe(false);
    expect(
      isGithubConnectEnabled({ GITHUB_OAUTH_CLIENT_ID: "id", GITHUB_OAUTH_CLIENT_SECRET: "s" }),
    ).toBe(true);
  });

  it("builds the callback from BETTER_AUTH_URL only", () => {
    expect(githubCallbackUrl({ BETTER_AUTH_URL: "https://saqina.dev/some/path" })).toBe(
      "https://saqina.dev/api/github/callback",
    );
    expect(githubCallbackUrl({ BETTER_AUTH_URL: "http://localhost:3100" })).toBe(
      "http://localhost:3100/api/github/callback",
    );
    expect(githubCallbackUrl({})).toBeNull();
    expect(appOrigin({ BETTER_AUTH_URL: "not a url" })).toBeNull();
  });
});

describe("oauth helpers", () => {
  it("makes unguessable, distinct states", () => {
    const a = newState();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(newState()).not.toBe(a);
  });

  it("compares states strictly", () => {
    const s = newState();
    expect(sameState(s, s)).toBe(true);
    expect(sameState(s, `${s}x`)).toBe(false);
    expect(sameState(s, null)).toBe(false);
    expect(sameState(null, null)).toBe(false);
    expect(sameState("", "")).toBe(false);
  });

  it("round-trips the state cookie with the locale", () => {
    const state = newState();
    expect(unpackCookie(packCookie(state, "id"))).toEqual({ state, locale: "id" });
    expect(unpackCookie(undefined)).toBeNull();
    expect(unpackCookie("nodot")).toBeNull();
  });

  it("carries the page to return to in the cookie, and ignores one that is not ours", () => {
    const state = newState();
    const page = "/project/restaurant-pos-fhcq/integrations";
    expect(unpackCookie(packCookie(state, "en", page))).toEqual({
      state,
      locale: "en",
      next: page,
    });
    const forged = `${state}.en.${Buffer.from("https://evil.test/x").toString("base64url")}`;
    expect(unpackCookie(forged)).toEqual({ state, locale: "en" });
  });

  it("only returns to pages of the signed-in app", () => {
    expect(safeReturnPath("/project/shop-1/integrations")).toBe("/project/shop-1/integrations");
    expect(safeReturnPath("/dashboard/new")).toBe("/dashboard/new");
    for (const bad of [
      "https://evil.test",
      "//evil.test/dashboard",
      "/\\evil.test",
      "/project/../admin",
      "/api/github/connect",
      "/project/a?x=1",
      "",
      null,
      undefined,
    ])
      expect(safeReturnPath(bad as string)).toBeNull();
  });

  it("asks GitHub for the minimum scope with our state and callback", () => {
    const url = new URL(
      authorizeUrl({
        clientId: "abc",
        redirectUri: "https://x.test/api/github/callback",
        state: "st",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "abc",
      redirect_uri: "https://x.test/api/github/callback",
      state: "st",
      scope: GITHUB_SCOPE,
    });
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("exchanges a code for a token, and rejects every other answer", async () => {
    const input = {
      code: "c",
      clientId: "id",
      clientSecret: "sec",
      redirectUri: "https://x.test/cb",
    };
    await expect(exchangeCode(input, json({ access_token: "gho_abcdefghijk" }))).resolves.toBe(
      "gho_abcdefghijk",
    );
    // GitHub answers 200 with an error body for a bad or reused code.
    await expect(
      exchangeCode(input, json({ error: "bad_verification_code" })),
    ).rejects.toMatchObject({
      code: "exchange_failed",
    });
    await expect(exchangeCode(input, json({}, 500))).rejects.toMatchObject({
      code: "exchange_failed",
    });
    await expect(
      exchangeCode(input, (async () => {
        throw new Error("network");
      }) as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: "exchange_failed" });
  });

  it("reads only a sane login name", async () => {
    await expect(fetchLogin("t", json({ login: "octocat", email: "x@y.z" }))).resolves.toBe(
      "octocat",
    );
    await expect(fetchLogin("t", json({ login: "bad login!" }))).rejects.toMatchObject({
      code: "profile_failed",
    });
    await expect(fetchLogin("t", json({}, 401))).rejects.toMatchObject({ code: "profile_failed" });
  });
});
