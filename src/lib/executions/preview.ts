import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { executionEvents, executions } from "@/lib/db/schema";
import type { DeploymentState } from "@/lib/domain/enums";
import { appendEvent } from "./events";

const EVENT = {
  pending: "preview.build_started",
  success: "preview.updated",
  failure: "preview.failed",
} as const;

/**
 * A deployment of a branch was recorded (from the host's webhook or from Vercel). If the branch is
 * an execution's work branch, say so in that execution's log: building, ready, or failed. The same
 * deployment in the same state is announced once, so a repeated webhook adds nothing. Anything that
 * is not about a work branch is ignored.
 */
export async function recordPreviewState(
  tx: Executor,
  input: {
    projectId: string;
    ref: string | null;
    deploymentId: string;
    state: DeploymentState;
    url: string | null;
    environment: "production" | "preview";
  },
): Promise<void> {
  if (!input.ref || input.environment !== "preview" || input.state === "inactive") return;
  const [execution] = await tx
    .select({ id: executions.id })
    .from(executions)
    .where(and(eq(executions.projectId, input.projectId), eq(executions.branch, input.ref)))
    .orderBy(desc(executions.createdAt))
    .limit(1);
  if (!execution) return;
  const type = EVENT[input.state];
  const seen = await tx
    .select({ payload: executionEvents.payload })
    .from(executionEvents)
    .where(
      and(
        eq(executionEvents.executionId, execution.id),
        inArray(executionEvents.type, [
          "preview.build_started",
          "preview.updated",
          "preview.failed",
        ]),
      ),
    )
    .orderBy(desc(executionEvents.seq))
    .limit(20);
  if (
    seen.some(
      (e) => e.payload.deploymentId === input.deploymentId && e.payload.state === input.state,
    )
  )
    return;
  await appendEvent(tx, { executionId: execution.id, projectId: input.projectId }, type, {
    deploymentId: input.deploymentId,
    state: input.state,
    url: input.url,
    ref: input.ref,
  });
}
