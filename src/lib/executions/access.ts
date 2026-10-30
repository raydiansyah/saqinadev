import "server-only";
import { eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { ExecutionRow } from "./types";

/**
 * A worker has no session. It acts for the person who started the execution, with that person's
 * current rights: if they left the project, the work stops with NOT_FOUND instead of running
 * on borrowed access.
 */
export async function accessFor(
  execution: ExecutionRow,
  executor: Executor = db,
): Promise<ProjectAccess> {
  if (!execution.createdBy) throw new AppError("NOT_FOUND");
  const [user] = await executor
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, execution.createdBy));
  if (!user) throw new AppError("NOT_FOUND");
  const actor: Actor = { id: user.id, name: user.name, email: user.email, image: user.image };
  return loadProjectAccess(actor, { id: execution.projectId }, "content:write", executor);
}
