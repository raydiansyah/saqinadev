import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  clients,
  clientUsers,
  organizationMembers,
  organizations,
  orgBrand,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { canOrg, requireOrg } from "@/lib/organizations/service";
import { parse } from "@/lib/validation";
import { checkAccent } from "./contrast";
import { inspectLogo, type LogoMime } from "./logo";
import { assertWhiteLabelUnlocked, whiteLabelState } from "./service";

/**
 * Brand settings of an organization. Every read that reaches a client goes through `loadBrand`,
 * which returns nothing while white label is closed, so locking it brings the Saqina look back
 * without deleting anything. Every write goes through `assertWhiteLabelUnlocked`.
 */

// Plain text only: control characters are dropped, spaces trimmed, empty becomes null.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const optionalText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL, "").trim())
    .pipe(z.string().max(max))
    .transform((s) => s || null);

// Used in a mail header, so no line breaks, quotes or angle brackets.
const headerName = optionalText(80).refine((s) => s === null || !/[\r\n"<>,;]/.test(s), "invalid");

const brandInput = z.object({
  brandName: optionalText(80),
  legalName: optionalText(120),
  taxNumber: optionalText(40),
  address: optionalText(300),
  accentColor: z
    .string()
    .trim()
    .transform((s) => s.toLowerCase() || null),
  emailFromName: headerName,
  replyTo: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.email().max(200)]))
    .transform((s) => s || null),
});

export interface BrandView {
  organizationId: string;
  name: string | null;
  legalName: string | null;
  taxNumber: string | null;
  address: string | null;
  accentColor: string | null;
  hasLogo: boolean;
  logoUrl: string | null;
  emailFromName: string | null;
  replyTo: string | null;
}

const toView = (r: typeof orgBrand.$inferSelect): BrandView => ({
  organizationId: r.organizationId,
  name: r.brandName,
  legalName: r.legalName,
  taxNumber: r.taxNumber,
  address: r.address,
  accentColor: r.accentColor,
  hasLogo: r.logoData !== null,
  logoUrl: r.logoData ? `/api/brand/${r.organizationId}/logo?v=${r.updatedAt.getTime()}` : null,
  emailFromName: r.emailFromName,
  replyTo: r.replyTo,
});

/** The brand clients see, or null while white label is closed or nothing is set. */
export async function loadBrand(organizationId: string): Promise<BrandView | null> {
  const [row] = await db.select().from(orgBrand).where(eq(orgBrand.organizationId, organizationId));
  if (!row) return null;
  if (!(await whiteLabelState(organizationId)).unlocked) return null;
  return toView(row);
}

/** What an invoice, receipt or contract prints as its issuer. */
export interface IssuerView {
  /** Legal name when set, else brand name, else the organization's own name. */
  name: string;
  taxNumber: string | null;
  address: string | null;
  brand: BrandView | null;
}

export async function loadIssuer(
  organizationId: string,
  organizationName?: string,
): Promise<IssuerView> {
  const brand = await loadBrand(organizationId);
  const name =
    organizationName ??
    (
      await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
    )[0]?.name ??
    "";
  return {
    name: brand?.legalName ?? brand?.name ?? name,
    taxNumber: brand?.taxNumber ?? null,
    address: brand?.address ?? null,
    brand,
  };
}

/**
 * The brand of the portal for one person: the organization behind their client accounts, when
 * all of them belong to the same one. Someone who represents clients of two agencies sees the
 * default look rather than one agency's brand on the other's data.
 */
export async function portalBrand(actor: Actor): Promise<BrandView | null> {
  const rows = await db
    .selectDistinct({ organizationId: clients.organizationId })
    .from(clientUsers)
    .innerJoin(clients, eq(clients.id, clientUsers.clientId))
    .where(and(eq(clientUsers.userId, actor.id), eq(clients.status, "active")));
  return rows.length === 1 ? loadBrand(rows[0].organizationId) : null;
}

export interface BrandSettings {
  organizationId: string;
  organizationName: string;
  canEdit: boolean;
  unlocked: boolean;
  settings: BrandView | null;
}

/** The settings page: the actor's organization, whether they may edit, and what is saved. */
export async function getBrandSettings(actor: Actor): Promise<BrandSettings> {
  const { org, role } = await requireOrg(actor, "org:read");
  const [state, [row]] = await Promise.all([
    whiteLabelState(org.id),
    db.select().from(orgBrand).where(eq(orgBrand.organizationId, org.id)),
  ]);
  return {
    organizationId: org.id,
    organizationName: org.name,
    canEdit: state.unlocked && canOrg(role, "brand:write"),
    unlocked: state.unlocked,
    settings: row ? toView(row) : null,
  };
}

async function writable(actor: Actor) {
  const { org } = await requireOrg(actor, "brand:write");
  await assertWhiteLabelUnlocked(org.id);
  return org;
}

export async function saveBrand(actor: Actor, raw: unknown) {
  const org = await writable(actor);
  const data = parse(brandInput, raw);
  if (data.brandName && /saqina/i.test(data.brandName) && !/saqina/i.test(org.name))
    throw new AppError("VALIDATION_ERROR", "The brand name cannot imitate the platform", {
      brandName: "whiteLabel.brand.imitation",
    });
  if (data.accentColor) {
    const verdict = checkAccent(data.accentColor);
    if (verdict !== "ok")
      throw new AppError("VALIDATION_ERROR", "The accent colour is not readable", {
        accentColor: `whiteLabel.brand.accent.${verdict}`,
      });
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(orgBrand)
      .values({ organizationId: org.id, ...data, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: orgBrand.organizationId,
        set: { ...data, updatedBy: actor.id },
      });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "brand.updated",
      entityType: "organization",
      entityId: org.id,
      metadata: { accent: data.accentColor, name: data.brandName },
    });
  });
}

export async function saveLogo(actor: Actor, bytes: Uint8Array) {
  const org = await writable(actor);
  const verdict = inspectLogo(bytes);
  if (!verdict.ok)
    throw new AppError("VALIDATION_ERROR", "The logo is not accepted", {
      logo: `whiteLabel.brand.logo.${verdict.reason}`,
    });
  await db.transaction(async (tx) => {
    const set = { logoData: Buffer.from(bytes), logoMime: verdict.mime, updatedBy: actor.id };
    await tx
      .insert(orgBrand)
      .values({ organizationId: org.id, ...set })
      .onConflictDoUpdate({ target: orgBrand.organizationId, set });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "brand.logo_changed",
      entityType: "organization",
      entityId: org.id,
      metadata: { bytes: bytes.length, mime: verdict.mime },
    });
  });
}

export async function removeLogo(actor: Actor) {
  const org = await writable(actor);
  await db
    .update(orgBrand)
    .set({ logoData: null, logoMime: null, updatedBy: actor.id })
    .where(eq(orgBrand.organizationId, org.id));
}

/**
 * The logo bytes for someone who belongs to the organization (staff) or to one of its clients.
 * Anyone else, a closed white label, and a missing logo all look the same: not found.
 */
export async function readLogo(
  actor: Actor,
  organizationId: string,
): Promise<{ bytes: Uint8Array; mime: LogoMime }> {
  if (!z.uuid().safeParse(organizationId).success) throw new AppError("NOT_FOUND");
  const [member] = await db
    .select({ id: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, actor.id),
      ),
    )
    .limit(1);
  const [asClient] = member
    ? []
    : await db
        .select({ id: clientUsers.userId })
        .from(clientUsers)
        .innerJoin(clients, eq(clients.id, clientUsers.clientId))
        .where(and(eq(clientUsers.userId, actor.id), eq(clients.organizationId, organizationId)))
        .limit(1);
  if (!member && !asClient) throw new AppError("NOT_FOUND");
  const brand = await loadBrand(organizationId);
  const [row] = await db
    .select({ data: orgBrand.logoData, mime: orgBrand.logoMime })
    .from(orgBrand)
    .where(eq(orgBrand.organizationId, organizationId));
  if (!brand || !row?.data || (row.mime !== "image/png" && row.mime !== "image/jpeg"))
    throw new AppError("NOT_FOUND");
  return { bytes: new Uint8Array(row.data), mime: row.mime };
}

/** The logo as a file for a PDF, while white label is open. Server-side only: nothing here is a route. */
export async function loadLogoFile(
  organizationId: string,
): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!(await loadBrand(organizationId))) return null;
  const [row] = await db
    .select({ data: orgBrand.logoData, mime: orgBrand.logoMime })
    .from(orgBrand)
    .where(eq(orgBrand.organizationId, organizationId));
  if (!row?.data) return null;
  return { data: row.data, format: row.mime === "image/jpeg" ? "jpg" : "png" };
}
