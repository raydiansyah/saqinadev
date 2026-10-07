import { describe, expect, it } from "vitest";
import { en as legalEn } from "@/content/legal/en";
import { id as legalId } from "@/content/legal/id";
import { en as siteEn } from "@/content/site/en";
import { id as siteId } from "@/content/site/id";
import enMessages from "../messages/en.json";
import idMessages from "../messages/id.json";

/** Paths of every string leaf; array indices collapse so lists may differ in length. */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [path];
  if (Array.isArray(value)) return [...new Set(value.flatMap((v) => shape(v, `${path}[]`)))];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  return [];
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe.each([
  ["UI messages", enMessages, idMessages],
  ["site content", siteEn, siteId],
  ["legal documents", legalEn, legalId],
])("%s", (_, en, id) => {
  it("has the same keys in English and Indonesian", () => {
    expect(new Set(shape(id))).toEqual(new Set(shape(en)));
  });

  it("has no em dashes", () => {
    for (const text of [...strings(en), ...strings(id)]) expect(text).not.toContain("—");
  });
});

describe("Indonesian content", () => {
  it("is actually translated, not copied from English", () => {
    expect(siteId.hero.title).not.toBe(siteEn.hero.title);
    expect(idMessages.common.startProject).not.toBe(enMessages.common.startProject);
    expect(legalId.privacy.intro).not.toBe(legalEn.privacy.intro);
  });

  it("uses demo examples the Indonesian keywords recognise", async () => {
    const { findProfile } = await import("@/lib/interview/profiles");
    for (const example of siteId.demo.examples) expect(findProfile(example), example).toBeDefined();
  });
});

describe("legal documents", () => {
  it("cite the Indonesian data protection law and keep placeholders visible", () => {
    expect(legalEn.privacy.sections.flatMap((s) => strings(s)).join(" ")).toContain(
      "No. 27 of 2022",
    );
    expect(legalId.privacy.sections.flatMap((s) => strings(s)).join(" ")).toContain(
      "Nomor 27 Tahun 2022",
    );
    expect(strings(legalEn).join(" ")).toContain("[COMPANY NAME]");
    expect(strings(legalId).join(" ")).toContain("[NAMA PERUSAHAAN]");
  });

  it("use unique section ids for anchors", () => {
    for (const doc of [legalEn.privacy, legalEn.terms, legalId.privacy, legalId.terms]) {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
