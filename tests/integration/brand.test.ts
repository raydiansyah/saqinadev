import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { auditEvents, organizationMembers, organizations, orgBrand, users } from "@/lib/db/schema";
import { renderEmail } from "@/lib/email/layout";
import { AppError } from "@/lib/errors";
import {
  getBrandSettings,
  loadBrand,
  loadIssuer,
  portalBrand,
  readLogo,
  removeLogo,
  saveBrand,
  saveLogo,
} from "@/lib/white-label/brand";
import { grantWhiteLabel, revokeWhiteLabel } from "@/lib/white-label/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

/** A PNG with a valid header; the check reads only the signature and the size. */
function png(width = 200, height = 80) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

const FIELDS = {
  brandName: "Studio Biru",
  legalName: "PT Studio Biru Digital",
  taxNumber: "01.234.567.8-901.000",
  address: "Jl. Merdeka 1\nBandung",
  accentColor: "#1f6feb",
  emailFromName: "Studio Biru",
  replyTo: "halo@studiobiru.test",
};

let platform: Actor;
let owner: Actor;
let client: Actor;
let stranger: Actor;
let slug: string;
let orgId: string;

beforeEach(async () => {
  await resetDatabase();
  platform = await createUser("Platform", "platform@example.test");
  await db.update(users).set({ platformRole: "owner" }).where(eq(users.id, platform.id));
  owner = await createUser("Owner");
  stranger = await createUser("Stranger");
  slug = await project(owner, "Website redesign");
  orgId = (await loadProjectAccess(owner, { slug }, "project:read")).project.organizationId;
  const c = await createClient(owner, { name: "PT ABC", email: "client@abc.test" });
  await setProjectClient(owner, slug, { clientId: c.id, portalEnabled: true, currency: "IDR" });
  const { url } = await createInvitation(owner, c.id, { email: "client@abc.test" });
  client = await createUser("Budi", "client@abc.test");
  await acceptInvitation(client, url.split("/invite/")[1]);
});

const open = () =>
  grantWhiteLabel(platform, {
    organizationId: orgId,
    basis: "agreement",
    reference: "AGR-2026-001",
    validUntil: "",
  });

describe("brand settings stay behind the white-label lock", () => {
  it("refuses every write and shows nothing while locked", async () => {
    expect(await code(saveBrand(owner, FIELDS))).toBe("AUTHORIZATION_ERROR");
    expect(await code(saveLogo(owner, png()))).toBe("AUTHORIZATION_ERROR");
    expect(await loadBrand(orgId)).toBeNull();
    const view = await getBrandSettings(owner);
    expect(view).toMatchObject({ unlocked: false, canEdit: false });
  });

  it("lets an owner save once it is open, and records who changed what", async () => {
    await open();
    await saveBrand(owner, FIELDS);
    expect(await loadBrand(orgId)).toMatchObject({
      name: "Studio Biru",
      legalName: "PT Studio Biru Digital",
      accentColor: "#1f6feb",
      replyTo: "halo@studiobiru.test",
      hasLogo: false,
    });
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.type, "brand.updated"));
    expect(event.actorId).toBe(owner.id);
    expect(JSON.stringify(event.metadata)).not.toContain("halo@studiobiru.test");
    expect((await getBrandSettings(owner)).canEdit).toBe(true);
  });

  it("returns to the Saqina look when it closes, without deleting the settings", async () => {
    await open();
    await saveBrand(owner, FIELDS);
    await revokeWhiteLabel(platform, { organizationId: orgId });
    expect(await loadBrand(orgId)).toBeNull();
    expect(await db.select().from(orgBrand)).toHaveLength(1);
    expect(await portalBrand(client)).toBeNull();
    expect(await code(saveBrand(owner, FIELDS))).toBe("AUTHORIZATION_ERROR");
    await open();
    expect((await loadBrand(orgId))?.name).toBe("Studio Biru");
  });

  it("refuses people who are not an owner or admin of the organization", async () => {
    await open();
    // A team organization (not personal), so that a member's active organization is this one.
    await db.update(organizations).set({ personal: false }).where(eq(organizations.id, orgId));
    const member = await createUser("Member");
    await db
      .insert(organizationMembers)
      .values({ organizationId: orgId, userId: member.id, role: "member" });
    expect((await getBrandSettings(member)).canEdit).toBe(false);
    expect(await code(saveBrand(member, FIELDS))).toBe("AUTHORIZATION_ERROR");
    expect(await code(saveLogo(member, png()))).toBe("AUTHORIZATION_ERROR");
    expect(await loadBrand(orgId)).toBeNull();
    // Someone with no link to it works in their own organization and cannot reach this one.
    expect((await getBrandSettings(stranger)).organizationId).not.toBe(orgId);
  });
});

describe("what a brand may contain", () => {
  beforeEach(open);

  it("refuses an accent that is unreadable and a name that imitates the platform", async () => {
    expect(await code(saveBrand(owner, { ...FIELDS, accentColor: "#222222" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(saveBrand(owner, { ...FIELDS, accentColor: "blue" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(saveBrand(owner, { ...FIELDS, brandName: "Saqina Official" }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await loadBrand(orgId)).toBeNull();
  });

  it("keeps header fields plain: no line breaks, quotes or angle brackets in the sender name", async () => {
    expect(await code(saveBrand(owner, { ...FIELDS, emailFromName: 'Evil"\r\nBcc: x' }))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await code(saveBrand(owner, { ...FIELDS, replyTo: "not-an-email" }))).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("clears empty fields and strips control characters", async () => {
    await saveBrand(owner, {
      ...FIELDS,
      address: "Jl. A\u0000\u0007 1",
      taxNumber: "   ",
      accentColor: "",
    });
    expect(await loadBrand(orgId)).toMatchObject({
      address: "Jl. A 1",
      taxNumber: null,
      accentColor: null,
    });
  });

  it("prints the legal name, tax number and address as the issuer", async () => {
    await saveBrand(owner, FIELDS);
    expect(await loadIssuer(orgId)).toMatchObject({
      name: "PT Studio Biru Digital",
      taxNumber: "01.234.567.8-901.000",
    });
    await saveBrand(owner, { ...FIELDS, legalName: "" });
    expect((await loadIssuer(orgId)).name).toBe("Studio Biru");
    await revokeWhiteLabel(platform, { organizationId: orgId });
    expect(await loadIssuer(orgId, "Owner")).toMatchObject({ name: "Owner", brand: null });
  });
});

describe("the logo", () => {
  beforeEach(open);

  it("accepts a real PNG and refuses anything else", async () => {
    await saveLogo(owner, png());
    expect((await loadBrand(orgId))?.hasLogo).toBe(true);
    const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    expect(await code(saveLogo(owner, svg))).toBe("VALIDATION_ERROR");
    expect(await code(saveLogo(owner, png(10, 10)))).toBe("VALIDATION_ERROR");
    expect(await code(saveLogo(owner, new Uint8Array(300 * 1024)))).toBe("VALIDATION_ERROR");
    await removeLogo(owner);
    expect((await loadBrand(orgId))?.hasLogo).toBe(false);
  });

  it("is readable by the organization and its clients, and by no one else", async () => {
    await saveLogo(owner, png());
    expect((await readLogo(owner, orgId)).mime).toBe("image/png");
    expect((await readLogo(client, orgId)).bytes.length).toBe(33);
    expect(await code(readLogo(stranger, orgId))).toBe("NOT_FOUND");
    expect(await code(readLogo(owner, "not-a-uuid"))).toBe("NOT_FOUND");

    // A client of another organization gets nothing either.
    const otherOwner = await createUser("Other Owner");
    const otherSlug = await project(otherOwner, "Other project");
    const oc = await createClient(otherOwner, { name: "Other", email: "o@other.test" });
    await setProjectClient(otherOwner, otherSlug, {
      clientId: oc.id,
      portalEnabled: true,
      currency: "IDR",
    });
    const inv = await createInvitation(otherOwner, oc.id, { email: "o@other.test" });
    const otherClient = await createUser("Other", "o@other.test");
    await acceptInvitation(otherClient, inv.url.split("/invite/")[1]);
    expect(await code(readLogo(otherClient, orgId))).toBe("NOT_FOUND");
  });

  it("is not served once white label closes", async () => {
    await saveLogo(owner, png());
    await revokeWhiteLabel(platform, { organizationId: orgId });
    expect(await code(readLogo(owner, orgId))).toBe("NOT_FOUND");
    expect(await code(readLogo(client, orgId))).toBe("NOT_FOUND");
  });
});

describe("the portal and mail show the agency, not Saqina", () => {
  it("gives the client the brand of their one agency", async () => {
    await open();
    await saveBrand(owner, FIELDS);
    expect((await portalBrand(client))?.name).toBe("Studio Biru");
    expect(await portalBrand(stranger)).toBeNull();
  });

  it("renders client mail with the brand name and accent, and a powered-by line", () => {
    const content = {
      preheader: { en: "p", id: "p" },
      title: { en: "New invoice", id: "Invoice baru" },
      body: { en: ["Hello"], id: ["Halo"] },
      buttons: [{ label: { en: "Open", id: "Buka" }, url: "https://saqina.dev/x" }],
    };
    const branded = renderEmail(content, "en", "https://saqina.dev", {
      name: "Studio <Biru>",
      accent: "#1f6feb",
    });
    expect(branded.html).toContain("Studio &lt;Biru&gt;");
    expect(branded.html).toContain("#1f6feb");
    expect(branded.html).toContain("Powered by");
    expect(branded.html).not.toContain("logo-mark-light.png");
    expect(branded.text).toContain("Studio <Biru>");
    const plain = renderEmail(content, "en", "https://saqina.dev");
    expect(plain.html).toContain("logo-mark-light.png");
    expect(plain.html).not.toContain("#1f6feb");
  });
});
