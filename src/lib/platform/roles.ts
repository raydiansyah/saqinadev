import "server-only";
import { count, eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { PlatformRole } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";

const envOwners = () =>
  (process.env.PLATFORM_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Platform Owner = `users.platformRole = owner`. While nobody holds that role yet, the
 * emails in PLATFORM_OWNER_EMAILS act as owners so a fresh install can be set up.
 */
export async function isPlatformOwner(actor: Actor | null): Promise<boolean> {
  if (!actor) return false;
  const [me] = await db
    .select({ role: users.platformRole })
    .from(users)
    .where(eq(users.id, actor.id));
  if (me?.role === "owner") return true;
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.platformRole, "owner"));
  return n === 0 && envOwners().includes(actor.email.toLowerCase());
}

export async function requirePlatformOwner(actor: Actor): Promise<void> {
  if (!(await isPlatformOwner(actor))) throw new AppError("AUTHORIZATION_ERROR");
}

export async function listPlatformOwners() {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.platformRole, "owner"));
}

/** Promote or demote by email. The last owner cannot demote themselves out of the platform. */
export async function setPlatformRole(actor: Actor, email: string, role: PlatformRole) {
  await requirePlatformOwner(actor);
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));
    if (!target) throw new AppError("NOT_FOUND");
    if (role === "user") {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(users)
        .where(eq(users.platformRole, "owner"));
      if (target.platformRole === "owner" && n <= 1)
        throw new AppError("CONFLICT", "Last owner", { email: "lastOwner" });
    }
    // The env bootstrap owner becomes a real DB owner on first promotion.
    const [me] = await tx
      .select({ role: users.platformRole })
      .from(users)
      .where(eq(users.id, actor.id));
    if (me?.role !== "owner")
      await tx.update(users).set({ platformRole: "owner" }).where(eq(users.id, actor.id));
    await tx.update(users).set({ platformRole: role }).where(eq(users.id, target.id));
    return { id: target.id, role };
  });
}
