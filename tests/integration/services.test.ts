import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  aiServices,
  auditEvents,
  clients,
  projects,
  serviceInquiries,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  archiveService,
  createService,
  duplicateService,
  getService,
  listServices,
  moveService,
  seedStarterServices,
  setServiceFlag,
  updateService,
} from "@/lib/services/admin";
import {
  convertInquiryToClient,
  listInquiries,
  submitInquiry,
  updateInquiryStatus,
} from "@/lib/services/inquiries";
import {
  getPublicService,
  listPublicServices,
  listSitemapServices,
  resolveServiceRedirect,
} from "@/lib/services/queries";
import { STARTER_SERVICES } from "@/lib/services/starter";
import { createUser, resetDatabase } from "../helpers/db";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

let owner: Actor;
let member: Actor;

const input = (slug: string, over: Record<string, unknown> = {}) => ({
  ...STARTER_SERVICES[0],
  slug,
  internalName: slug,
  title: { en: `Title ${slug}`, id: `Judul ${slug}` },
  ...over,
});

async function makeOwner() {
  const actor = await createUser("Owner");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, actor.id));
  return actor;
}

beforeEach(async () => {
  await resetDatabase();
  owner = await makeOwner();
  member = await createUser("Member");
});

describe("owner authorization", () => {
  it("rejects non-owners for every management function", async () => {
    const { id } = await createService(owner, input("svc-a"));
    // Thunks, so each call starts only when its turn comes: eager promises that reject before
    // they are awaited would surface as unhandled rejections.
    const attempts: (() => Promise<unknown>)[] = [
      () => createService(member, input("svc-b")),
      () => updateService(member, id, input("svc-a")),
      () => setServiceFlag(member, id, { flag: "isPublished", value: true }),
      () => setServiceFlag(member, id, { flag: "showPrice", value: true }),
      () => moveService(member, id, "down"),
      () => archiveService(member, id, true),
      () => duplicateService(member, id),
      () => seedStarterServices(member),
      () => listServices(member),
      () => getService(member, id),
      () => listInquiries(member),
      () => updateInquiryStatus(member, id, { status: "contacted" }),
      () => convertInquiryToClient(member, id),
    ];
    for (const attempt of attempts) expect(await code(attempt())).toBe("AUTHORIZATION_ERROR");
    expect((await db.select().from(aiServices)).length).toBe(1);
  });
});

describe("public catalog", () => {
  it("shows only published, public, non-archived services in order", async () => {
    const a = await createService(owner, input("svc-a", { isPublished: true }));
    const b = await createService(owner, input("svc-b", { isPublished: true, isComingSoon: true }));
    await createService(owner, input("svc-draft", { isPublished: false }));
    await createService(owner, input("svc-hidden", { isPublished: true, isPublic: false }));
    const archived = await createService(owner, input("svc-archived", { isPublished: true }));
    await archiveService(owner, archived.id, true);
    await moveService(owner, b.id, "up");

    const list = await listPublicServices("en");
    expect(list.map((s) => s.slug)).toEqual(["svc-b", "svc-a"]);
    expect(list[0].isComingSoon).toBe(true);
    expect(await getPublicService("svc-a", "en")).not.toBeNull();
    for (const slug of ["svc-draft", "svc-hidden", "svc-archived", "missing"])
      expect(await getPublicService(slug, "en")).toBeNull();
    expect((await listSitemapServices()).map((s) => s.slug)).toEqual(["svc-b", "svc-a"]);
    expect(a.id).toBeDefined();
  });

  it("filters related services through the same rule", async () => {
    const visible = await createService(owner, input("svc-visible", { isPublished: true }));
    const hidden = await createService(
      owner,
      input("svc-hidden", { isPublished: true, isPublic: false }),
    );
    const draft = await createService(owner, input("svc-draft"));
    await createService(
      owner,
      input("svc-main", { isPublished: true, relatedIds: [visible.id, hidden.id, draft.id] }),
    );
    const result = await getPublicService("svc-main", "en");
    expect(result?.related.map((s) => s.slug)).toEqual(["svc-visible"]);
  });

  it("keeps the stored price when it is hidden and never serializes it", async () => {
    const { id } = await createService(
      owner,
      input("svc-priced", {
        isPublished: true,
        pricingType: "fixed",
        priceAmount: 7_654_321,
        showPrice: true,
      }),
    );
    expect(JSON.stringify(await getPublicService("svc-priced", "en"))).toContain("7654321");
    await setServiceFlag(owner, id, { flag: "showPrice", value: false });
    const hidden = await getPublicService("svc-priced", "id");
    expect(hidden?.service.price).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain("7654321");
    expect(JSON.stringify(await listPublicServices("en"))).not.toContain("7654321");
    expect((await getService(owner, id)).priceAmount).toBe(7_654_321);
  });

  it("switches flags independently and records an audit trail", async () => {
    const { id } = await createService(owner, input("svc-flags"));
    await setServiceFlag(owner, id, { flag: "isPublished", value: true });
    await setServiceFlag(owner, id, { flag: "isComingSoon", value: true });
    expect(await getPublicService("svc-flags", "en")).not.toBeNull();
    await setServiceFlag(owner, id, { flag: "isPublic", value: false });
    expect(await getPublicService("svc-flags", "en")).toBeNull();
    await setServiceFlag(owner, id, { flag: "isPublic", value: true });
    await setServiceFlag(owner, id, { flag: "isFeatured", value: true });
    const row = await getService(owner, id);
    expect(row).toMatchObject({
      isPublished: true,
      isPublic: true,
      isComingSoon: true,
      isFeatured: true,
    });
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.entityId, id));
    expect(audits.length).toBeGreaterThanOrEqual(5);
  });

  it("cannot publish without a title; archiving unpublishes", async () => {
    const { id } = await createService(owner, input("svc-empty", { title: { en: "", id: "" } }));
    expect(await code(setServiceFlag(owner, id, { flag: "isPublished", value: true }))).toBe(
      "VALIDATION_ERROR",
    );
    const other = await createService(owner, input("svc-other", { isPublished: true }));
    await archiveService(owner, other.id, true);
    await archiveService(owner, other.id, false);
    expect((await getService(owner, other.id)).isPublished).toBe(false);
  });

  it("redirects an old slug and protects slugs from reuse", async () => {
    const { id } = await createService(owner, input("old-name", { isPublished: true }));
    await updateService(owner, id, input("new-name", { isPublished: true }));
    expect(await getPublicService("old-name", "en")).toBeNull();
    expect(await resolveServiceRedirect("old-name")).toBe("new-name");
    expect(await code(createService(owner, input("old-name")))).toBe("CONFLICT");
    expect(await code(createService(owner, input("new-name")))).toBe("CONFLICT");
    // A hidden service does not redirect.
    await setServiceFlag(owner, id, { flag: "isPublic", value: false });
    expect(await resolveServiceRedirect("old-name")).toBeNull();
  });

  it("reorders deterministically and duplicates as a private draft", async () => {
    const a = await createService(owner, input("svc-1", { isPublished: true }));
    const b = await createService(owner, input("svc-2", { isPublished: true }));
    const c = await createService(owner, input("svc-3", { isPublished: true }));
    await moveService(owner, c.id, "up");
    await moveService(owner, a.id, "down");
    expect((await listPublicServices("en")).map((s) => s.slug)).toEqual([
      "svc-3",
      "svc-1",
      "svc-2",
    ]);
    const copy = await duplicateService(owner, b.id);
    const row = await getService(owner, copy.id);
    expect(row).toMatchObject({ isPublished: false, slug: "svc-2-copy" });
  });

  it("adds the starter services as drafts once", async () => {
    expect(await seedStarterServices(owner)).toBe(5);
    expect(await seedStarterServices(owner)).toBe(0);
    expect(await listPublicServices("en")).toEqual([]);
    const { rows } = await listServices(owner);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => !r.showPrice && !r.isPublished)).toBe(true);
  });
});

describe("inquiries", () => {
  const valid = {
    name: "Budi",
    email: "budi@example.com",
    message: "We would like an assistant for our shop.",
    consent: true,
  };

  it("stores valid inquiries and refuses invalid or unsafe ones", async () => {
    await createService(owner, input("svc-open", { isPublished: true }));
    await createService(owner, input("svc-draft"));
    await createService(owner, input("svc-hidden", { isPublished: true, isPublic: false }));

    const ok = await submitInquiry({ ...valid, serviceSlug: "svc-open" }, { ip: "1.1.1.1" });
    expect(ok.id).toBeTruthy();
    const [stored] = await db.select().from(serviceInquiries);
    expect(stored).toMatchObject({ serviceSlug: "svc-open", status: "new", consent: true });
    expect(stored.ipHash).not.toContain("1.1.1.1");

    expect(await code(submitInquiry({ ...valid, consent: false }, { ip: "2.2.2.2" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(submitInquiry({ ...valid, email: "bad" }, { ip: "2.2.2.2" }))).toBe(
      "VALIDATION_ERROR",
    );
    for (const slug of ["svc-draft", "svc-hidden", "missing"])
      expect(
        await code(
          submitInquiry({ ...valid, email: `${slug}@x.com`, serviceSlug: slug }, { ip: "3.3.3.3" }),
        ),
      ).toBe("NOT_FOUND");
    expect(await db.select().from(serviceInquiries)).toHaveLength(1);

    // General inquiry without a service is allowed.
    expect(
      (await submitInquiry({ ...valid, email: "other@example.com" }, { ip: "4.4.4.4" })).id,
    ).toBeTruthy();
  });

  it("ignores bots (honeypot) and rate limits repeated submissions", async () => {
    const bot = await submitInquiry({ ...valid, website: "http://spam" }, { ip: "9.9.9.9" });
    expect(bot.id).toBeNull();
    expect(await db.select().from(serviceInquiries)).toHaveLength(0);
    for (let i = 0; i < 3; i++)
      await submitInquiry({ ...valid, email: "same@example.com" }, { ip: `5.5.5.${i}` });
    expect(
      await code(submitInquiry({ ...valid, email: "same@example.com" }, { ip: "5.5.5.9" })),
    ).toBe("RATE_LIMIT");
  });

  it("lets only the owner triage, and conversion creates a client and nothing else", async () => {
    const { id } = (await submitInquiry(
      { ...valid, email: "convert@example.com" },
      { ip: "6.6.6.6" },
    )) as { id: string };
    expect((await listInquiries(owner)).map((i) => i.id)).toContain(id);
    await updateInquiryStatus(owner, id, { status: "contacted" });
    expect(await code(updateInquiryStatus(owner, id, { status: "converted" }))).toBe(
      "VALIDATION_ERROR",
    );
    const client = await convertInquiryToClient(owner, id);
    const [row] = await db.select().from(serviceInquiries).where(eq(serviceInquiries.id, id));
    expect(row).toMatchObject({ status: "converted", clientId: client.id });
    expect(await code(convertInquiryToClient(owner, id))).toBe("CONFLICT");
    expect(
      (await db.select().from(clients)).filter((c) => c.email === "convert@example.com"),
    ).toHaveLength(1);
    expect(await db.select().from(projects)).toHaveLength(0);
  });
});
