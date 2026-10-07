import { describe, expect, it } from "vitest";
import { classify } from "@/lib/interview/classify";
import { en } from "@/lib/interview/copy/en";
import { id } from "@/lib/interview/copy/id";
import { createRuleBasedEngine } from "@/lib/interview/engine";
import { answers } from "./fixtures";

/** Every leaf of the copy tree, with functions called on sample input. */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    // joinList takes an array; every other copy function takes strings.
    const fn = value as (...args: unknown[]) => string;
    return [[path, path === "joinList" ? fn(["x", "y"]) : fn("x", "y", "z")]];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe("engine copy", () => {
  it("has the same keys in English and Indonesian", () => {
    const keys = (c: unknown) =>
      leaves(c)
        .map(([k]) => k.replace(/\[\d+\]$/, "[]"))
        .sort();
    expect(new Set(keys(id))).toEqual(new Set(keys(en)));
  });

  it("has no empty strings (except intentional blanks) and no em dashes", () => {
    for (const [path, text] of [...leaves(en), ...leaves(id)]) {
      if (!path.endsWith(".required")) expect(text, path).not.toBe("");
      expect(text, path).not.toContain("—");
    }
  });
});

describe("Indonesian engine", () => {
  const engine = createRuleBasedEngine("id");
  const a = answers({
    projectType: "pos",
    projectDescription: "Aplikasi kasir untuk restoran kecil",
    features: ["auth", "pos", "inventory"],
    developmentMode: "saqina",
  });

  it("names, explains and briefs in Indonesian", () => {
    const rec = engine.recommend(a);
    expect(rec.projectLabel).toBe("POS Restoran");
    expect(rec.development.reason).toContain("Anda memilih");
    expect(engine.brief(rec)).toContain("## Tujuan");
  });

  it("keeps the slug stable across languages", () => {
    expect(engine.recommend(a).slug).toBe(createRuleBasedEngine("en").recommend(a).slug);
    expect(engine.recommend(a).slug).toBe("restaurant-pos");
  });

  it("raises the business app insight in Indonesian", () => {
    const insight = engine
      .insights(
        answers({
          projectType: "company-profile",
          features: ["auth", "inventory", "payment", "rbac"],
        }),
      )
      .find((i) => i.id === "content-site-app-features");
    expect(insight?.message).toContain("Aplikasi Web Manajemen Bisnis");
    expect(insight?.message).toContain(
      "Website Perusahaan + Portal Karyawan + Inventaris + Pembayaran",
    );
  });

  it("reads Indonesian free text", () => {
    const c = classify("Website sekolah, guru unggah nilai dan siswa login");
    expect(c.projectType).toBe("school-website");
    expect(c.features).toEqual(expect.arrayContaining(["auth", "file-upload"]));
    expect(c.audience).toEqual(expect.arrayContaining(["teachers", "students"]));
  });
});
