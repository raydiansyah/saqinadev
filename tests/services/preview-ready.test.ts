import { describe, expect, it } from "vitest";
import { presetFor, valueFits } from "@/lib/services/presets";
import { previewIssues, type ServiceValues } from "@/lib/services/preview-ready";

const neon = (over: Partial<ServiceValues> = {}): ServiceValues => ({
  provider: "neon",
  label: "Neon",
  vars: [{ name: "DATABASE_URL", secret: true, production: true, preview: true }],
  production: { DATABASE_URL: "postgres://prod" },
  preview: { DATABASE_URL: "postgres://branch" },
  development: {},
  ...over,
});

describe("preview readiness", () => {
  it("an app with no database or sign-in has nothing to wait for", () => {
    expect(previewIssues([])).toEqual([]);
  });

  it("is ready when the preview has its own database", () => {
    expect(previewIssues([neon()])).toEqual([]);
  });

  it("asks for a missing preview value", () => {
    expect(previewIssues([neon({ preview: {} })])).toEqual([
      { code: "missingPreview", service: "neon:Neon", name: "DATABASE_URL" },
    ]);
  });

  it("asks for a missing live value", () => {
    expect(previewIssues([neon({ production: {} })]).map((i) => i.code)).toEqual([
      "missingProduction",
    ]);
  });

  it("refuses a preview that points at the live database", () => {
    const same = neon({ preview: { DATABASE_URL: "postgres://prod" } });
    expect(previewIssues([same]).map((i) => i.code)).toEqual(["previewSameAsProduction"]);
  });

  it("refuses live Clerk keys in the preview, and the same secret key", () => {
    const clerk: ServiceValues = {
      provider: "clerk",
      label: "Clerk",
      vars: [
        {
          name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          secret: false,
          production: true,
          preview: true,
        },
        { name: "CLERK_SECRET_KEY", secret: true, production: true, preview: true },
      ],
      production: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_a", CLERK_SECRET_KEY: "sk_live_a" },
      preview: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_a", CLERK_SECRET_KEY: "sk_live_a" },
      development: {},
    };
    expect(
      previewIssues([clerk])
        .map((i) => i.code)
        .sort(),
    ).toEqual(["clerkLiveKeyInPreview", "clerkLiveKeyInPreview", "previewSameAsProduction"]);
  });

  it("a local value is optional, but never the live database or a live Clerk key", () => {
    expect(previewIssues([neon({ development: { DATABASE_URL: "postgres://mine" } })])).toEqual([]);
    expect(
      previewIssues([neon({ development: { DATABASE_URL: "postgres://prod" } })]).map(
        (i) => i.code,
      ),
    ).toEqual(["localSameAsProduction"]);
  });

  it("checks the shape of a value per provider", () => {
    const db = presetFor("neon")?.vars[0];
    expect(valueFits(db?.check, "postgresql://u:p@host/db")).toBe(true);
    expect(valueFits(db?.check, "mysql://x")).toBe(false);
    expect(valueFits("clerk_secret", "pk_test_x")).toBe(false);
    expect(valueFits(undefined, "anything")).toBe(true);
  });
});
