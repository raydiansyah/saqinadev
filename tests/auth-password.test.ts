import { describe, expect, it } from "vitest";
import { PASSWORD_ENDPOINTS, passwordIssue } from "@/lib/auth/password-policy";

describe("passwordIssue", () => {
  it("accepts 8+ characters with a number and a symbol", () => {
    expect(passwordIssue("Saqina#2026")).toBeNull();
    expect(passwordIssue("a1!aaaaa")).toBeNull();
    expect(passwordIssue("kata-sandi-9")).toBeNull();
  });
  it("rejects short passwords first", () => {
    expect(passwordIssue("a1!")).toBe("tooShort");
    expect(passwordIssue("")).toBe("tooShort");
  });
  it("rejects long passwords that lack a number or a symbol", () => {
    expect(passwordIssue("abcdefghij")).toBe("weak");
    expect(passwordIssue("abcdefg1")).toBe("weak"); // no symbol
    expect(passwordIssue("abcdefg!")).toBe("weak"); // no number
    expect(passwordIssue("1234 5678")).toBe("weak"); // whitespace is not a symbol
  });
  it("covers every endpoint that sets a new password", () => {
    expect(Object.keys(PASSWORD_ENDPOINTS).sort()).toEqual([
      "/change-password",
      "/reset-password",
      "/set-password",
      "/sign-up/email",
    ]);
  });
});
