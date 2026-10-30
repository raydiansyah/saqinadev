import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { executions } from "@/lib/db/schema";
import { DEFAULT_EXECUTION_BUDGET, type ExecutionStatus } from "@/lib/domain/executions";

/** An execution row for a project, inserted directly so a test controls its starting state. */
export async function seedExecution(
  actor: Actor,
  slug: string,
  patch: { status?: ExecutionStatus; request?: string; mode?: "plan" | "build" } = {},
) {
  const { project } = await loadProjectAccess(actor, { slug }, "content:write");
  const [row] = await db
    .insert(executions)
    .values({
      projectId: project.id,
      mode: patch.mode ?? "build",
      request: patch.request ?? "Build the checkout",
      status: patch.status ?? "queued",
      budget: DEFAULT_EXECUTION_BUDGET,
      createdBy: actor.id,
    })
    .returning();
  return { execution: row, projectId: project.id };
}
