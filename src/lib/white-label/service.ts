import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { todayIso } from "@/lib/billing/rules";
import { db } from "@/lib/db/client";
import { organizationMembers, organizations, whiteLabelGrants } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { isPlatformOwner } from "@/lib/platform/roles";
import { parse } from "@/lib/validation";
import {
  evaluateGrant,
  WHITE_LABEL_BASES,
  type WhiteLabelGrant,
  type WhiteLabelState,
} from "./policy";

async function openGrant(orgId: string): Promise<WhiteLabelGrant | null> {
  const [row] = await db
    .select()
    .from(whiteLabelGrants)
    .where(eq(whiteLabelGrants.organizationId, orgId))
    .orderBy(desc(whiteLabelGrants.grantedAt))
    .limit(1);
  return row ?? null;
}

/** Whether white label is open for the organization today, and if not, why. */
export async function whiteLabelState(orgId: string, today = todayIso()): Promise<WhiteLabelState> {
  return evaluateGrant(await openGrant(orgId), today);
}

/** The one gate every brand setting goes through: locked unless a paid plan or an agreement opened it. */
export async function assertWhiteLabelUnlocked(orgId: string): Promise<void> {
  const state = await whiteLabelState(orgId);
  if (!state.unlocked)
    throw new AppError("AUTHORIZATION_ERROR", "White label is locked", {
      whiteLabel: "whiteLabel.locked",
    });
}

export interface OrgWhiteLabel {
  organizationId: string;
  name: string;
  state: WhiteLabelState;
}

/**
 * The organizations the person belongs to with their white-label state; the platform owner sees
 * every organization (to open or close it). Personal workspaces are listed too: they are locked
 * like any other until a plan or an agreement says otherwise.
 */
export async function listWhiteLabel(actor: Actor): Promise<OrgWhiteLabel[]> {
  const owner = await isPlatformOwner(actor);
  const orgs = owner
    ? await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .orderBy(asc(organizations.name))
        .limit(200)
    : await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
        .where(eq(organizationMembers.userId, actor.id))
        .orderBy(asc(organizations.name));
  const today = todayIso();
  return Promise.all(
    orgs.map(async (o) => ({
      organizationId: o.id,
      name: o.name,
      state: evaluateGrant(await openGrant(o.id), today),
    })),
  );
}

const grantInput = z.object({
  organizationId: z.uuid(),
  basis: z.enum(WHITE_LABEL_BASES),
  reference: z.string().trim().min(3).max(120),
  note: z.string().trim().max(500).default(""),
  validUntil: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .transform((v) => v || null),
});

async function requirePlatformOwner(actor: Actor) {
  // Not found, not forbidden: whether the switch exists is not for everyone to learn.
  if (!(await isPlatformOwner(actor))) throw new AppError("NOT_FOUND");
}

/**
 * Opens white label for an organization after a paid plan or a signed agreement, recording
 * which. A new grant closes the previous one. Only the platform owner can do this.
 */
export async function grantWhiteLabel(actor: Actor, raw: unknown) {
  const data = parse(grantInput, raw);
  await requirePlatformOwner(actor);
  if (data.validUntil && data.validUntil < todayIso())
    throw new AppError("VALIDATION_ERROR", "The end date is in the past", {
      validUntil: "whiteLabel.pastEnd",
    });
  await db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId));
    if (!org) throw new AppError("NOT_FOUND");
    await tx
      .update(whiteLabelGrants)
      .set({ revokedAt: new Date(), revokedBy: actor.id })
      .where(and(eq(whiteLabelGrants.organizationId, org.id), isNull(whiteLabelGrants.revokedAt)));
    await tx.insert(whiteLabelGrants).values({
      organizationId: org.id,
      basis: data.basis,
      reference: data.reference,
      note: data.note,
      validUntil: data.validUntil,
      grantedBy: actor.id,
    });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "whitelabel.granted",
      entityType: "organization",
      entityId: org.id,
      metadata: { basis: data.basis, reference: data.reference, validUntil: data.validUntil },
    });
  });
}

/** Closes white label again: the plan ended, the agreement ended, or it was breached. */
export async function revokeWhiteLabel(actor: Actor, raw: unknown) {
  const { organizationId } = parse(z.object({ organizationId: z.uuid() }), raw);
  await requirePlatformOwner(actor);
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(whiteLabelGrants)
      .set({ revokedAt: new Date(), revokedBy: actor.id })
      .where(
        and(
          eq(whiteLabelGrants.organizationId, organizationId),
          isNull(whiteLabelGrants.revokedAt),
        ),
      )
      .returning({ id: whiteLabelGrants.id });
    if (rows.length === 0) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "whitelabel.revoked",
      entityType: "organization",
      entityId: organizationId,
    });
  });
}
