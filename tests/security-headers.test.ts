import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

describe("security headers", () => {
  it("locks the production CSP to this origin plus Turnstile", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("allows eval and websockets only in development", () => {
    const csp = contentSecurityPolicy(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
  it("sends HSTS only in production", () => {
    const names = (dev: boolean) => securityHeaders(dev).map((h) => h.key);
    expect(names(false)).toContain("Strict-Transport-Security");
    expect(names(true)).not.toContain("Strict-Transport-Security");
    expect(names(false)).toEqual(
      expect.arrayContaining(["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"]),
    );
  });
});
