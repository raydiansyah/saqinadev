import { afterEach, describe, expect, it, vi } from "vitest";
import { isCaptchaEnabled } from "@/lib/captcha/config";

vi.mock("server-only", () => ({}));

const keys = { TURNSTILE_SECRET_KEY: "secret", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site" };

describe("isCaptchaEnabled", () => {
  it("is on in production with both keys", () => {
    expect(isCaptchaEnabled({ NODE_ENV: "production", ...keys })).toBe(true);
  });
  it("is off in development and test even with keys", () => {
    expect(isCaptchaEnabled({ NODE_ENV: "development", ...keys })).toBe(false);
    expect(isCaptchaEnabled({ NODE_ENV: "test", ...keys })).toBe(false);
  });
  it("is off in production when either key is missing", () => {
    expect(isCaptchaEnabled({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "s" })).toBe(false);
    expect(isCaptchaEnabled({ NODE_ENV: "production", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k" })).toBe(
      false,
    );
    expect(isCaptchaEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("verifyCaptcha", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function load() {
    return (await import("@/lib/captcha/verify")).verifyCaptcha;
  }
  function production() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
  }

  it("passes without a token when disabled (local, tests)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await load())(undefined)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing token in production without calling Cloudflare", async () => {
    production();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await load())(undefined)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a token Cloudflare approves and sends the secret server-side", async () => {
    production();
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await load())("tok", "1.2.3.4")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(JSON.parse(String(init.body))).toEqual({
      secret: "secret",
      response: "tok",
      remoteip: "1.2.3.4",
    });
  });

  it("rejects a token Cloudflare refuses", async () => {
    production();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
      ),
    );
    expect(await (await load())("bad")).toBe(false);
  });

  it("fails closed on HTTP errors and network failures", async () => {
    production();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    expect(await (await load())("tok")).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    expect(await (await load())("tok")).toBe(false);
  });
});
