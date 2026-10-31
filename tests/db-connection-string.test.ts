import { describe, expect, it } from "vitest";
import { withVerifiedSsl } from "@/lib/db/connection-string";

describe("withVerifiedSsl", () => {
  it("spells the old modes as verify-full, wherever they sit in the query", () => {
    expect(withVerifiedSsl("postgres://u@h/db?sslmode=require")).toBe(
      "postgres://u@h/db?sslmode=verify-full",
    );
    expect(withVerifiedSsl("postgres://u@h/db?channel_binding=require&sslmode=require")).toBe(
      "postgres://u@h/db?channel_binding=require&sslmode=verify-full",
    );
    expect(withVerifiedSsl("postgres://u@h/db?sslmode=prefer&x=1")).toBe(
      "postgres://u@h/db?sslmode=verify-full&x=1",
    );
    expect(withVerifiedSsl("postgres://u@h/db?sslmode=verify-ca")).toBe(
      "postgres://u@h/db?sslmode=verify-full",
    );
  });

  it("leaves everything else alone", () => {
    for (const url of [
      "postgres://u@localhost:5432/db",
      "postgres://u@h/db?sslmode=verify-full",
      "postgres://u@h/db?sslmode=disable",
      "postgres://u@h/db?sslmode=no-verify",
    ])
      expect(withVerifiedSsl(url)).toBe(url);
  });
});
