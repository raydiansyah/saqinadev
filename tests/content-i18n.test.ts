import { describe, expect, it } from "vitest";
import { en as legalEn } from "@/content/legal/en";
import { id as legalId } from "@/content/legal/id";
import { en as siteEn } from "@/content/site/en";
import { id as siteId } from "@/content/site/id";
import appEn from "../messages/app.en.json";
import appId from "../messages/app.id.json";
import assistantEn from "../messages/assistant.en.json";
import assistantId from "../messages/assistant.id.json";
import authEn from "../messages/auth.en.json";
import authId from "../messages/auth.id.json";
import billingEn from "../messages/billing.en.json";
import billingId from "../messages/billing.id.json";
import clientsEn from "../messages/clients.en.json";
import clientsId from "../messages/clients.id.json";
import enMessages from "../messages/en.json";
import engagementEn from "../messages/engagement.en.json";
import engagementId from "../messages/engagement.id.json";
import idMessages from "../messages/id.json";
import notifyEn from "../messages/notify.en.json";
import notifyId from "../messages/notify.id.json";
import platformEn from "../messages/platform.en.json";
import platformId from "../messages/platform.id.json";
import portalEn from "../messages/portal.en.json";
import portalId from "../messages/portal.id.json";
import portalEngagementEn from "../messages/portal-engagement.en.json";
import portalEngagementId from "../messages/portal-engagement.id.json";
import projectEn from "../messages/project.en.json";
import projectId from "../messages/project.id.json";
import workspaceEn from "../messages/workspace.en.json";
import workspaceId from "../messages/workspace.id.json";

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
  ["auth messages", authEn, authId],
  ["app messages", appEn, appId],
  ["project messages", projectEn, projectId],
  ["workspace messages", workspaceEn, workspaceId],
  ["assistant messages", assistantEn, assistantId],
  ["platform messages", platformEn, platformId],
  ["billing messages", billingEn, billingId],
  ["portal messages", portalEn, portalId],
  ["clients messages", clientsEn, clientsId],
  ["engagement messages", engagementEn, engagementId],
  ["portal engagement messages", portalEngagementEn, portalEngagementId],
  ["notify messages", notifyEn, notifyId],
  ["site content", siteEn, siteId],
  ["legal documents", legalEn, legalId],
])("%s", (_, en, id) => {
  it("has the same keys in English and Indonesian", () => {
    expect(new Set(shape(id))).toEqual(new Set(shape(en)));
  });

  it("uses no dots in keys (next-intl reserves them for nesting)", () => {
    for (const path of shape(en))
      expect(
        path.split(".").every((k) => k.length > 0),
        path,
      ).toBe(true);
    const keys = (v: unknown): string[] =>
      v && typeof v === "object" ? Object.entries(v).flatMap(([k, c]) => [k, ...keys(c)]) : [];
    for (const key of keys(en)) expect(key, key).not.toContain(".");
  });

  it("has no em dashes", () => {
    for (const text of [...strings(en), ...strings(id)]) expect(text).not.toContain("—");
  });
});

describe("message files", () => {
  it("never define the same top-level namespace twice", () => {
    const names = [
      enMessages,
      authEn,
      appEn,
      projectEn,
      workspaceEn,
      assistantEn,
      platformEn,
      billingEn,
      portalEn,
      clientsEn,
      engagementEn,
      portalEngagementEn,
      notifyEn,
    ].flatMap((m) => Object.keys(m));
    expect(new Set(names).size).toBe(names.length);
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
