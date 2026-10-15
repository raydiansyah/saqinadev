import { describe, expect, it } from "vitest";
import { trustedOrigins } from "@/lib/auth/origins";

describe("trustedOrigins", () => {
  it("trusts the apex domain and its www twin", () => {
    expect(trustedOrigins({ BETTER_AUTH_URL: "https://saqina.dev" })).toEqual([
      "https://saqina.dev",
      "https://www.saqina.dev",
    ]);
  });
  it("trusts the apex when the base URL is the www host", () => {
    expect(trustedOrigins({ BETTER_AUTH_URL: "https://www.saqina.dev" })).toEqual([
      "https://www.saqina.dev",
      "https://saqina.dev",
    ]);
  });
  it("adds no twin for localhost, ports or IPs", () => {
    expect(trustedOrigins({ BETTER_AUTH_URL: "http://localhost:3000" })).toEqual([
      "http://localhost:3000",
    ]);
    expect(trustedOrigins({ BETTER_AUTH_URL: "http://127.0.0.1:3100" })).toEqual([
      "http://127.0.0.1:3100",
    ]);
  });
  it("adds explicit extras, normalises them and ignores junk", () => {
    expect(
      trustedOrigins({
        BETTER_AUTH_URL: "https://saqina.dev",
        BETTER_AUTH_TRUSTED_ORIGINS: "https://staging.saqina.dev/, nonsense, ",
      }),
    ).toContain("https://staging.saqina.dev");
    expect(trustedOrigins({})).toEqual([]);
  });
});
