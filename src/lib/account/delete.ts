import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  clientInvitations,
  organizationMembers,
  organizations,
  projectMembers,
  projects,
  serviceInquiries,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";

const input = z.object({ confirmEmail: z.string().trim().max(320) });

export type DeleteBlocker = "lastPlatformOwner" | "ownsSharedProjects" | "ownsSharedOrganizations";

export interface DeletionPlan {
  blockers: DeleteBlocker[];
  /** Slugs of projects that would have to be handed over or deleted first. */
  sharedProjects: string[];
  /** Projects that are only yours and are deleted with the account. */
  soloProjects: number;
}

/** What deleting the account would do, and what stops it. Pure reads. */
export async function planDeletion(actor: Actor): Promise<DeletionPlan> {
  const [me] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!me) throw new AppError("NOT_FOUND");
  const blockers: DeleteBlocker[] = [];

  if (me.platformRole === "owner") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.platformRole, "owner"), ne(users.id, actor.id)));
    if (Number(n) === 0) blockers.push("lastPlatformOwner");
  }

  // Projects this person owns: deleting the account deletes them (the owner link cascades).
  const owned = await db
    .select({ id: projects.id, slug: projects.slug })
    .from(projects)
    .where(eq(projects.ownerId, actor.id));
  const withOthers = owned.length
    ? await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            inArray(
              projectMembers.projectId,
              owned.map((p) => p.id),
            ),
            ne(projectMembers.userId, actor.id),
          ),
        )
        .groupBy(projectMembers.projectId)
    : [];
  const shared = new Set(withOthers.map((w) => w.projectId));
  const sharedProjects = owned.filter((p) => shared.has(p.id)).map((p) => p.slug);
  if (sharedProjects.length > 0) blockers.push("ownsSharedProjects");

  // Organizations they own that other people also belong to.
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.ownerId, actor.id), eq(organizations.personal, false)));
  if (orgs.length > 0) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(organizationMembers)
      .where(
        and(
          inArray(
            organizationMembers.organizationId,
            orgs.map((o) => o.id),
          ),
          ne(organizationMembers.userId, actor.id),
        ),
      );
    if (Number(n) > 0) blockers.push("ownsSharedOrganizations");
  }

  return { blockers, sharedProjects, soloProjects: owned.length - sharedProjects.length };
}

/**
 * Right to erasure. The person must type their own email. Refused while it would destroy other
 * people's work (shared projects or organizations they own) or leave the platform without an
 * owner. Otherwise the account, its sessions, keys, notifications and solo projects go; content
 * they wrote in projects that live on stays, with the author link removed.
 */
export async function deleteAccount(actor: Actor, raw: unknown): Promise<void> {
  const { confirmEmail } = parse(input, raw);
  if (!(await allow(`account-delete:${actor.id}`, 3, 60 * 60 * 1000)))
    throw new AppError("RATE_LIMIT");
  const [me] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!me) throw new AppError("NOT_FOUND");
  if (confirmEmail.toLowerCase() !== me.email.toLowerCase())
    throw new AppError("VALIDATION_ERROR", "Email does not match", {
      confirmEmail: "accountEmailMismatch",
    });

  const plan = await planDeletion(actor);
  if (plan.blockers.length > 0)
    throw new AppError("CONFLICT", "Account cannot be deleted yet", {
      account: `accountBlocked${plan.blockers[0][0].toUpperCase()}${plan.blockers[0].slice(1)}`,
    });

  await db.transaction(async (tx) => {
    // Their own public inquiries and unaccepted invitations are personal data keyed by email.
    await tx
      .delete(serviceInquiries)
      .where(sql`lower(${serviceInquiries.email}) = ${me.email.toLowerCase()}`);
    await tx
      .delete(clientInvitations)
      .where(
        and(
          sql`lower(${clientInvitations.email}) = ${me.email.toLowerCase()}`,
          sql`${clientInvitations.acceptedAt} is null`,
        ),
      );
    // A pseudonymous subject, not the id or the email, so the record proves it happened
    // without keeping who it was.
    await recordAudit(tx, {
      actorId: null,
      scope: "platform",
      type: "account.deleted",
      entityType: "user",
      entityId: null,
      metadata: {
        subject: createHash("sha256").update(actor.id).digest("hex").slice(0, 16),
        soloProjects: plan.soloProjects,
      },
    });
    // Sessions, accounts, memberships, notifications, keys and owned projects cascade;
    // authored content keeps its place with the author link set to null.
    await tx.delete(users).where(eq(users.id, actor.id));
  });
}
