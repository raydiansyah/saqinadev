import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { clientInvitations, platformSettings } from "@/lib/db/schema";
import { parse } from "@/lib/validation";
import { requirePlatformOwner } from "./roles";

/** Open by default: a missing row keeps the behavior of installs that predate the switch. */
export async function isRegistrationEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ on: platformSettings.registrationEnabled })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row?.on ?? true;
}

export async function setRegistrationEnabled(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { enabled } = parse(z.object({ enabled: z.boolean() }), input);
  await db.transaction(async (tx) => {
    await tx
      .insert(platformSettings)
      .values({ id: 1, registrationEnabled: enabled, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { registrationEnabled: enabled, updatedBy: actor.id },
      });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "platform.registration.changed",
      entityType: "platform_settings",
      entityId: "1",
      metadata: { enabled },
    });
  });
}

/**
 * Whether this email may create an account right now. While registration is closed, a pending
 * client invitation (not accepted, revoked or expired) for the same email still lets the invited
 * person in; nobody else.
 */
export async function canRegister(email: string): Promise<boolean> {
  if (await isRegistrationEnabled()) return true;
  const [invite] = await db
    .select({ id: clientInvitations.id })
    .from(clientInvitations)
    .where(
      and(
        sql`lower(${clientInvitations.email}) = ${email.trim().toLowerCase()}`,
        isNull(clientInvitations.acceptedAt),
        isNull(clientInvitations.revokedAt),
        gt(clientInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(invite);
}
