import "server-only";
import { eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

/** Runs as the conversation's owner, so model choice and limits are the project's, not global. */
export async function accessFor(projectId: string, userId: string): Promise<ProjectAccess> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new AppError("NOT_FOUND");
  const actor: Actor = { id: u.id, name: u.name, email: u.email, image: u.image ?? null };
  return loadProjectAccess(actor, { id: projectId }, "content:write");
}
