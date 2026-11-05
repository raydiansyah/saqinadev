import { describe, expect, it } from "vitest";
import { deployVars, isPublicName, nameProblem, parseDotenv } from "@/lib/env-vars/rules";

describe("nameProblem", () => {
  it("accepts upper snake case and refuses the rest", () => {
    expect(nameProblem("GEOCODER_API_KEY")).toBeNull();
    for (const bad of ["lower", "1ABC", "A-B", "", "A".repeat(65)])
      expect(nameProblem(bad), bad).toBe("invalid");
  });
  it("refuses names the platform sets itself", () => {
    for (const n of ["NODE_ENV", "VERCEL", "VERCEL_URL", "PORT", "CI", "NEXT_RUNTIME"])
      expect(nameProblem(n), n).toBe("reserved");
  });
});

describe("parseDotenv", () => {
  it("reads plain, exported, quoted and commented lines", () => {
    const text = [
      "# a comment",
      "",
      "A=1",
      "export B = two words # trailing",
      'C="quoted # not a comment"',
      "D='single'",
      'E="line\\nbreak"',
      "F=",
    ].join("\n");
    const { entries, invalid } = parseDotenv(text);
    expect(Object.fromEntries(entries.map((e) => [e.name, e.value]))).toEqual({
      A: "1",
      B: "two words",
      C: "quoted # not a comment",
      D: "single",
      E: "line\nbreak",
      F: "",
    });
    expect(invalid).toEqual([]);
  });

  it("keeps the last of a repeated name and reports bad lines without their value", () => {
    const { entries, invalid } = parseDotenv("A=1\nA=2\nnot a line\nlower=x\nNODE_ENV=prod\nB=ok");
    expect(entries.map((e) => [e.name, e.value])).toEqual([
      ["A", "2"],
      ["B", "ok"],
    ]);
    expect(invalid).toEqual([
      { line: 3, reason: "syntax" },
      { line: 4, reason: "invalid" },
      { line: 5, reason: "reserved" },
    ]);
    expect(JSON.stringify(invalid)).not.toContain("prod");
  });

  it("refuses a value that is too long", () => {
    expect(parseDotenv(`A=${"x".repeat(5000)}`).invalid).toEqual([{ line: 1, reason: "too_long" }]);
  });
});

describe("deployVars", () => {
  const v = (over: Partial<Parameters<typeof deployVars>[0][number]> = {}) => ({
    name: "KEY",
    secret: true,
    production: "",
    preview: "",
    development: "",
    ...over,
  });

  it("sends one entry per environment that has a value", () => {
    expect(deployVars([v({ production: "p", preview: "w" })])).toEqual([
      { key: "KEY", value: "p", secret: true, target: "production" },
      { key: "KEY", value: "w", secret: true, target: "preview" },
      { key: "KEY", value: "w", secret: true, target: "development" },
    ]);
  });

  it("gives development its own value, else the preview's, and never the production one", () => {
    expect(deployVars([v({ production: "live" })])).toEqual([
      { key: "KEY", value: "live", secret: true, target: "production" },
    ]);
    const own = deployVars([v({ preview: "w", development: "mine" })]).find(
      (x) => x.target === "development",
    );
    expect(own?.value).toBe("mine");
  });

  it("never sends a NEXT_PUBLIC_ name as a secret, because it ends up in the browser", () => {
    expect(isPublicName("NEXT_PUBLIC_MAP_STYLE")).toBe(true);
    const out = deployVars([v({ name: "NEXT_PUBLIC_MAP_STYLE", production: "x" })]);
    expect(out.every((x) => x.secret === false)).toBe(true);
  });
});
