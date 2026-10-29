import { describe, expect, it } from "vitest";
import {
  compareEnv,
  parseEnvNames,
  quoteEnv,
  renderEnvExample,
  renderEnvLocal,
} from "@/lib/services/env-files";
import type { ServiceValues } from "@/lib/services/preview-ready";

const neon: ServiceValues = {
  provider: "neon",
  label: "Neon",
  vars: [{ name: "DATABASE_URL", secret: true, production: true, preview: true }],
  production: { DATABASE_URL: "postgres://live" },
  preview: { DATABASE_URL: "postgres://preview" },
  development: {},
};

describe("env files", () => {
  it(".env.example holds names only", () => {
    const text = renderEnvExample([neon]);
    expect(text).toContain("DATABASE_URL=\n");
    expect(text).not.toContain("postgres://");
  });

  it(".env.local uses the local value, else the preview's, and never the live one", () => {
    expect(renderEnvLocal([neon])).toContain('DATABASE_URL="postgres://preview"');
    const own = { ...neon, development: { DATABASE_URL: "postgres://mine" } };
    const text = renderEnvLocal([own]);
    expect(text).toContain('DATABASE_URL="postgres://mine"');
    expect(text).not.toContain("postgres://live");
  });

  it("says when a variable has no value for this machine yet", () => {
    const empty = { ...neon, preview: {}, development: {} };
    expect(renderEnvLocal([empty])).toContain("# DATABASE_URL= (no local or preview value yet)");
  });

  it("quotes values so dotenv reads them back exactly", () => {
    expect(quoteEnv('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
  });

  it("reads names from a .env.example and compares both ways", () => {
    const names = parseEnvNames("# comment\nDATABASE_URL=\nexport STRIPE_KEY=x\n\nNODE_ENV=dev\n");
    expect(names).toEqual(["DATABASE_URL", "STRIPE_KEY", "NODE_ENV"]);
    expect(compareEnv(names, ["DATABASE_URL", "CLERK_SECRET_KEY"])).toEqual({
      missingInSaqina: ["STRIPE_KEY"],
      missingInRepo: ["CLERK_SECRET_KEY"],
    });
  });
});
