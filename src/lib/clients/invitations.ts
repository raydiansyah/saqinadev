import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { getEmailSender } from "@/lib/auth/email";
import { db } from "@/lib/db/client";
import { clientInvitations, clients, clientUsers, organizations } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { loadClient } from "./service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function inviteUrl(token: string, locale: string): string {
  const base = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(
    /\/$/,
    "",
  );
  return `${base}/${locale}/invite/${token}`;
}

/**
 * Creates a one-time portal invitation. The raw link is returned exactly once (to copy) and
 * emailed when an email provider is configured; only its hash is stored.
 */
export async function createInvitation(
  actor: Actor,
  clientId: string,
  input: unknown,
  locale = "en",
): Promise<{ url: string; emailed: boolean }> {
  const { email } = parse(z.object({ email: z.email().trim().toLowerCase().max(200) }), input);
  const { org, client } = await loadClient(actor, clientId, true);
  if (!allow(`invite:${actor.id}`, 20, 60 * 60 * 1000)) throw new AppError("RATE_LIMIT");

  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    // A new invitation for the same address replaces any open one.
    await tx
      .update(clientInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(clientInvitations.clientId, client.id),
          eq(clientInvitations.email, email),
          isNull(clientInvitations.acceptedAt),
          isNull(clientInvitations.revokedAt),
        ),
      );
    const [invite] = await tx
      .insert(clientInvitations)
      .values({
        clientId: client.id,
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        createdBy: actor.id,
      })
      .returning({ id: clientInvitations.id });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "client.invitation_created",
      entityType: "client_invitation",
      entityId: invite.id,
      metadata: { clientId: client.id },
    });
  });

  const url = inviteUrl(token, locale);
  let emailed = false;
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    await getEmailSender().send({
      to: email,
      subject: `${org.name} invited you to the project portal / mengundang Anda ke portal project`,
      text: [
        `${org.name} invited you to follow your projects with ${client.name} on Saqina Dev.`,
        url,
        "",
        `${org.name} mengundang Anda memantau project ${client.name} di Saqina Dev.`,
        url,
        "",
        "The link works once and expires in 7 days. / Tautan berlaku sekali, 7 hari.",
      ].join("\n"),
    });
    emailed = true;
  }
  return { url, emailed };
}

export async function revokeInvitation(actor: Actor, clientId: string, invitationId: string) {
  const { client } = await loadClient(actor, clientId, true);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(clientInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(clientInvitations.id, invitationId),
          eq(clientInvitations.clientId, client.id),
          isNull(clientInvitations.acceptedAt),
        ),
      )
      .returning({ id: clientInvitations.id });
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "client.invitation_revoked",
      entityType: "client_invitation",
      entityId: row.id,
    });
  });
}

export type InvitationState = "valid" | "expired" | "used" | "revoked" | "invalid";

/** What the invite page shows before sign-in. Holding the token is the only requirement. */
export async function previewInvitation(token: string): Promise<{
  state: InvitationState;
  email?: string;
  clientName?: string;
  orgName?: string;
}> {
  if (!/^[\w-]{20,100}$/.test(token)) return { state: "invalid" };
  const [row] = await db
    .select({ invite: clientInvitations, clientName: clients.name, orgName: organizations.name })
    .from(clientInvitations)
    .innerJoin(clients, eq(clients.id, clientInvitations.clientId))
    .innerJoin(organizations, eq(organizations.id, clients.organizationId))
    .where(eq(clientInvitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return { state: "invalid" };
  const { invite } = row;
  const state: InvitationState = invite.revokedAt
    ? "revoked"
    : invite.acceptedAt
      ? "used"
      : invite.expiresAt.getTime() < Date.now()
        ? "expired"
        : "valid";
  return { state, email: invite.email, clientName: row.clientName, orgName: row.orgName };
}

/**
 * Accepts an invitation for the signed-in user. The account email must match the invited
 * address, and each token works once.
 */
export async function acceptInvitation(
  actor: Actor,
  token: string,
): Promise<{ clientName: string }> {
  if (!allow(`invite-accept:${actor.id}`, 10, 15 * 60 * 1000)) throw new AppError("RATE_LIMIT");
  if (!/^[\w-]{20,100}$/.test(token)) throw new AppError("NOT_FOUND");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ invite: clientInvitations, clientName: clients.name })
      .from(clientInvitations)
      .innerJoin(clients, eq(clients.id, clientInvitations.clientId))
      .where(eq(clientInvitations.tokenHash, hashToken(token)))
      .for("update", { of: clientInvitations })
      .limit(1);
    if (!row) throw new AppError("NOT_FOUND");
    const { invite } = row;
    if (invite.revokedAt || invite.acceptedAt || invite.expiresAt.getTime() < Date.now())
      throw new AppError("CONFLICT", "Invitation is no longer valid", {
        token: "invite.unavailable",
      });
    if (invite.email !== actor.email.toLowerCase())
      throw new AppError("AUTHORIZATION_ERROR", "Invitation belongs to another email", {
        token: "invite.wrongEmail",
      });
    await tx
      .insert(clientUsers)
      .values({ clientId: invite.clientId, userId: actor.id })
      .onConflictDoNothing();
    await tx
      .update(clientInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: actor.id })
      .where(eq(clientInvitations.id, invite.id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "organization",
      type: "client.invitation_accepted",
      entityType: "client_invitation",
      entityId: invite.id,
      metadata: { clientId: invite.clientId },
    });
    return { clientName: row.clientName };
  });
}
