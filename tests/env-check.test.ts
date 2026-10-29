import { describe, expect, it } from "vitest";
import { checkEnv } from "@/lib/env-check";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://saqina.dev",
  NEXT_PUBLIC_SITE_URL: "https://saqina.dev",
  SAQINA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "c",
  RESEND_API_KEY: "r",
  EMAIL_FROM: "Saqina <no-reply@saqina.dev>",
  TURNSTILE_SECRET_KEY: "s",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k",
  OWNER_EMAIL: "owner@saqina.dev",
  S3_BUCKET: "saqina-files",
  S3_REGION: "ap-southeast-1",
  S3_ACCESS_KEY_ID: "id",
  S3_SECRET_ACCESS_KEY: "secret",
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
      SAQINA_ENCRYPTION_KEY: "not-32-bytes",
      BETTER_AUTH_URL: "http://saqina.dev",
    });
    expect(errors).toHaveLength(4);
  });
  it("warns about half-configured email and captcha, and local-only flags", () => {
    const { warnings, errors } = checkEnv({
      ...good,
      EMAIL_FROM: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      ALLOW_LOCAL_GIT: "1",
    });
    expect(errors).toEqual([]);
    expect(warnings.join(" | ")).toMatch(/RESEND_API_KEY and EMAIL_FROM/);
    expect(warnings.join(" | ")).toMatch(/Turnstile needs both keys/);
    expect(warnings.join(" | ")).toMatch(/ALLOW_LOCAL_GIT/);
  });

  it("warns when S3 is missing or half configured", () => {
    const {
      S3_BUCKET: _b,
      S3_REGION: _r,
      S3_ACCESS_KEY_ID: _i,
      S3_SECRET_ACCESS_KEY: _s,
      ...none
    } = good;
    expect(checkEnv(none).warnings.join(" ")).toContain("S3 is not configured");
    const { S3_SECRET_ACCESS_KEY: _x, ...half } = good;
    expect(checkEnv(half).warnings.join(" ")).toContain("half configured");
  });
});
