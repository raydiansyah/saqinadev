import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Tx } from "@/lib/db/client";
import { agentAssignments, agentRuns, agents, tasks } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { EventBatch } from "@/lib/events/emitter";
import type { Trace } from "@/lib/events/types";
import { cancelRunTx, meta, recordRunEvent } from "./run-core";

export type { RunRow } from "./run-core";
/** The run lifecycle lives in `run-core.ts` and `run-lifecycle.ts`; callers keep importing from here. */
export {
  cancelPendingProposals,
  cancelRunTx,
  lockRun,
  meta,
  recordRunEvent,
  transition,
} from "./run-core";
export { resolveRunReviewTx, startRun } from "./run-lifecycle";

/**
 * Creates an assignment and a queued run. A task has at most one open assignment: assigning
 * again replaces the open one (reassign) instead of piling up duplicates.
 */
export async function assignAgentTx(
  tx: Tx,
  access: ProjectAccess,
  input: { taskId: string; agentId: string; instructions: string },
  trace: Trace,
  batch: EventBatch,
): Promise<{ assignmentId: string; runId: string }> {
  const projectId = access.project.id;
  const [[task], [agent]] = await Promise.all([
    tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.projectId, projectId))),
    tx
      .select()
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.projectId, projectId))),
  ]);
  if (!task || !agent) throw new AppError("NOT_FOUND");
  if (agent.status === "disabled")
    throw new AppError("VALIDATION_ERROR", "Agent disabled", { agentId: "invalid" });

  // Close any open assignment for this task, together with its unfinished runs.
  const open = await tx
    .select()
    .from(agentAssignments)
    .where(
      and(
        eq(agentAssignments.taskId, task.id),
        inArray(agentAssignments.status, [
          "queued",
          "assigned",
          "running",
          "waiting",
          "blocked",
          "paused",
        ]),
      ),
    );
  for (const a of open) {
    const runs = await tx
      .select({ run: agentRuns, agent: agents })
      .from(agentRuns)
      .innerJoin(agents, eq(agents.id, agentRuns.agentId))
      .where(
        and(
          eq(agentRuns.assignmentId, a.id),
          inArray(agentRuns.status, ["queued", "paused", "waiting", "blocked", "running"]),
        ),
      );
    for (const r of runs) await cancelRunTx(tx, access, r.run, r.agent, task.title, batch);
    await tx
      .update(agentAssignments)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(eq(agentAssignments.id, a.id));
  }

  const [assignment] = await tx
    .insert(agentAssignments)
    .values({
      projectId,
      agentId: agent.id,
      taskId: task.id,
      status: "queued",
      priority: task.priority,
      instructions: input.instructions,
      createdBy: access.actor.id,
    })
    .returning();
  const [run] = await tx
    .insert(agentRuns)
    .values({
      projectId,
      agentId: agent.id,
      assignmentId: assignment.id,
      taskId: task.id,
      conversationId: trace.conversationId ?? null,
      proposalId: trace.proposalId ?? null,
      status: "queued",
      input: { instructions: input.instructions },
    })
    .returning();
  await recordRunEvent(tx, run, "AGENT_ASSIGNED", meta(agent, task.title), access.actor.id, batch);
  return { assignmentId: assignment.id, runId: run.id };
}
