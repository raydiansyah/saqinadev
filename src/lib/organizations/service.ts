import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db, type Executor } from "@/lib/db/client";
import { organizationMembers, organizations, users } from "@/lib/db/schema";
import type { OrgRole } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";

export type Organization = typeof organizations.$inferSelect;

export const ORG_ACTIONS = ["org:read", "clients:manage", "billing:read", "billing:write"] as const;
export type OrgAction = (typeof ORG_ACTIONS)[number];

const ORG_ROLE_ACTIONS: Record<OrgRole, readonly OrgAction[]> = {
  owner: ORG_ACTIONS,
  admin: ORG_ACTIONS,
  member: ["org:read"],
};

export const canOrg = (role: OrgRole, action: OrgAction) => ORG_ROLE_ACTIONS[role].includes(action);

const randomSuffix = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join("");

/**
 * Every user owns a personal organization. Called from the sign-up hook and lazily from
 * `activeOrg`, so it must be idempotent.
 */
export async function ensurePersonalOrg(userId: string, executor: Executor = db) {
  const [existing] = await executor
    .select()
    .from(organizations)
    .where(and(eq(organizations.ownerId, userId), eq(organizations.personal, true)))
    .limit(1);
  if (existing) return existing;
  const [user] = await executor
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError("NOT_FOUND");
  const [org] = await executor
    .insert(organizations)
    .values({
      name: user.name,
      slug: `personal-${randomSuffix()}`,
      personal: true,
      ownerId: userId,
    })
    .returning();
  await executor
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId, role: "owner" })
    .onConflictDoNothing();
  return org;
}

export interface OrgAccess {
  actor: Actor;
  role: OrgRole;
  org: Organization;
}

/**
 * The organization the actor works in. Today that is the first organization they belong to
 * (their personal one unless they were added to a team); an org switcher comes later.
 */
export async function activeOrg(actor: Actor, executor: Executor = db): Promise<OrgAccess> {
  const [row] = await executor
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, actor.id))
    .orderBy(asc(organizations.personal), asc(organizationMembers.createdAt))
    .limit(1);
  if (row) return { actor, role: row.role, org: row.org };
  const org = await ensurePersonalOrg(actor.id, executor);
  return { actor, role: "owner", org };
}

/** Membership check for a specific organization; non-members get NOT_FOUND. */
export async function loadOrgAccess(
  actor: Actor,
  organizationId: string,
  action: OrgAction,
  executor: Executor = db,
): Promise<OrgAccess> {
  const [row] = await executor
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, actor.id),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND");
  if (!canOrg(row.role, action)) throw new AppError("AUTHORIZATION_ERROR");
  return { actor, role: row.role, org: row.org };
}

/** The active org, requiring a permission. */
export async function requireOrg(actor: Actor, action: OrgAction, executor: Executor = db) {
  const access = await activeOrg(actor, executor);
  if (!canOrg(access.role, action)) throw new AppError("AUTHORIZATION_ERROR");
  return access;
}
