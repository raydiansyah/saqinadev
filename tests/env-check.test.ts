import { describe, expect, it } from "vitest";
import { checkEnv } from "@/lib/env-check";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://saqina.dev",
  NEXT_PUBLIC_SITE_URL: "https://saqina.dev",
  CRON_SECRET: "c",
  RESEND_API_KEY: "r",
  EMAIL_FROM: "Saqina <no-reply@saqina.dev>",
  TURNSTILE_SECRET_KEY: "s",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k",
  OWNER_EMAIL: "owner@saqina.dev",
};

describe("checkEnv", () => {
  it("is silent outside production", () => {
    expect(checkEnv({ NODE_ENV: "development" })).toEqual({ errors: [], warnings: [] });
  });
  it("accepts a complete production configuration", () => {
    expect(checkEnv(good)).toEqual({ errors: [], warnings: [] });
  });
  it("reports missing and malformed secrets as errors", () => {
    const { errors } = checkEnv({
      ...good,
      DATABASE_URL: "",
      BETTER_AUTH_SECRET: "short",
      BETTER_AUTH_URL: "http://saqina.dev",
    });
    expect(errors).toHaveLength(3);
  });
  it("warns about half-configured email and captcha", () => {
    const { warnings, errors } = checkEnv({
      ...good,
      EMAIL_FROM: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    });
    expect(errors).toEqual([]);
    expect(warnings.join(" | ")).toMatch(/RESEND_API_KEY and EMAIL_FROM/);
    expect(warnings.join(" | ")).toMatch(/Turnstile needs both keys/);
  });
});
