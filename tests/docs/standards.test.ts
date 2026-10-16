import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

const markdownIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? markdownIn(join(dir, e.name))
      : e.name.endsWith(".md")
        ? [join(dir, e.name)]
        : [],
  );

describe("engineering standards", () => {
  const files = [...markdownIn(join(ROOT, "docs")), join(ROOT, "CLAUDE.md")];

  it("exist, and the index lists every page", () => {
    const index = readFileSync(join(ROOT, "docs/standards/README.md"), "utf8");
    const pages = readdirSync(join(ROOT, "docs/standards")).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
    expect(pages.length).toBeGreaterThanOrEqual(9);
    for (const page of pages) expect(index, page).toContain(`(${page})`);
  });

  it("has no broken relative links", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\]\((?!https?:|mailto:|#)([^)#\s]+)(?:#[^)]*)?\)/g)) {
        const target = resolve(dirname(file), m[1]);
        expect(existsSync(target), `${file} -> ${m[1]}`).toBe(true);
      }
    }
  });

  it("is loaded by the context file, so AI tools start from it", () => {
    expect(readFileSync(join(ROOT, "CLAUDE.md"), "utf8")).toContain("docs/standards/README.md");
  });

  it("routes review by lane: every Red path named in governance has a CODEOWNERS rule", () => {
    const owners = readFileSync(join(ROOT, ".github/CODEOWNERS"), "utf8");
    for (const path of [
      "/src/lib/auth/",
      "/src/lib/billing/",
      "/src/lib/secrets/",
      "/src/lib/mcp/",
      "/src/lib/db/migrations/",
      "/src/app/api/",
    ])
      expect(owners, path).toContain(path);
  });
});
