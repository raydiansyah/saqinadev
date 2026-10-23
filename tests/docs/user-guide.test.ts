import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/locales";
import {
  DOC_AUDIENCES,
  DOC_SLUG,
  docAssetFile,
  getDoc,
  listDocs,
  parseDoc,
} from "@/lib/docs/content";

const IMAGE = /!\[[^\]]*\]\((\/[^)\s]+)\)/g;

describe("the user guide header", () => {
  const ok =
    "---\ntitle: A guide\ndescription: What it covers\norder: 2\nupdated: 2026-10-23\n---\n# Body\n";

  it("splits the header from the text", () => {
    expect(parseDoc("a-guide", ok)).toEqual({
      slug: "a-guide",
      title: "A guide",
      description: "What it covers",
      order: 2,
      updated: "2026-10-23",
      body: "# Body",
    });
  });

  it("refuses a page without a header or with a missing field", () => {
    expect(parseDoc("x", "# Just text")).toBeNull();
    expect(parseDoc("x", "---\ntitle: A\n---\nbody")).toBeNull();
    expect(parseDoc("x", ok.replace("order: 2", "order: soon"))).toBeNull();
  });

  it("only knows page names that cannot leave the folder", () => {
    for (const bad of ["../secret", "a/b", "A", "a_b", "", "-a", "a-"]) {
      expect(DOC_SLUG.test(bad), bad).toBe(false);
      expect(getDoc("owner", "en", bad), bad).toBeNull();
    }
    expect(DOC_SLUG.test("import-project")).toBe(true);
  });
});

describe("the guides that ship with the product", () => {
  const ASSET = /\/api\/docs\/assets\/(owner|client)\/([a-z0-9-]+\.png)/;

  it("has the same pages in every language, for each audience", () => {
    for (const audience of DOC_AUDIENCES) {
      const slugs = LOCALES.map((l) =>
        listDocs(audience, l)
          .map((d) => d.slug)
          .sort(),
      );
      expect(slugs[0].length, audience).toBeGreaterThan(0);
      for (const s of slugs) expect(s, audience).toEqual(slugs[0]);
    }
  });

  it("starts the team's guides with the import guide", () => {
    for (const locale of LOCALES) expect(listDocs("owner", locale)[0].slug).toBe("import-project");
  });

  it("keeps the audiences apart: the clients' guides never show the team's screenshots", () => {
    for (const audience of DOC_AUDIENCES)
      for (const locale of LOCALES)
        for (const meta of listDocs(audience, locale)) {
          const body = getDoc(audience, locale, meta.slug)?.body ?? "";
          for (const m of body.matchAll(IMAGE)) {
            const asset = ASSET.exec(m[1]);
            expect(asset, `${audience}/${locale}/${meta.slug}: ${m[1]}`).not.toBeNull();
            expect(asset?.[1], `${audience}/${locale}/${meta.slug}: ${m[1]}`).toBe(audience);
          }
        }
  });

  it("only points at screenshots that exist, and every guide shows at least one", () => {
    for (const audience of DOC_AUDIENCES)
      for (const locale of LOCALES)
        for (const meta of listDocs(audience, locale)) {
          const body = getDoc(audience, locale, meta.slug)?.body ?? "";
          const used = [...body.matchAll(IMAGE)].map((m) => ASSET.exec(m[1])?.[2] ?? "");
          expect(used.length, `${audience}/${locale}/${meta.slug}`).toBeGreaterThan(0);
          for (const name of used) {
            const file = docAssetFile(audience, name);
            expect(file && existsSync(file), `${audience}/${locale}: ${name}`).toBe(true);
          }
        }
  });

  it("describes each screenshot (alt text) in every language", () => {
    for (const audience of DOC_AUDIENCES)
      for (const locale of LOCALES)
        for (const meta of listDocs(audience, locale)) {
          const body = getDoc(audience, locale, meta.slug)?.body ?? "";
          for (const m of body.matchAll(/!\[([^\]]*)\]\(/g))
            expect(m[1].trim().length, `${audience}/${locale}/${meta.slug}`).toBeGreaterThan(10);
        }
  });
});

describe("screenshot names", () => {
  it("accepts a plain png name and nothing that could leave the folder", () => {
    expect(docAssetFile("owner", "import-01-new-project.png")).toContain(
      path.join("assets", "owner"),
    );
    for (const bad of ["../x.png", "a/b.png", "x.jpg", "X.png", "x.png/", "", ".png", "a..png"])
      expect(docAssetFile("owner", bad), bad).toBeNull();
  });
});
