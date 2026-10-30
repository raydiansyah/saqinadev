import "server-only";
import { and, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Executor, Tx } from "@/lib/db/client";
import {
  agentAssignments,
  agentRunEvents,
  agentRuns,
  agents,
  proposals,
  tasks,
} from "@/lib/db/schema";
import type { AssignmentStatus, RunStatus } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import type { EventBatch } from "@/lib/events/emitter";
import type { ProjectEventType } from "@/lib/events/types";
import { enqueueSkillExtraction } from "@/lib/memory/skills/extract";
import { settleRunUsages } from "@/lib/memory/skills/usage";
import { assertTransition, InvalidTransitionError } from "./state";

export type RunRow = typeof agentRuns.$inferSelect;
type AgentRow = typeof agents.$inferSelect;

const ASSIGNMENT_FOR: Record<RunStatus, AssignmentStatus> = {
  queued: "queued",
  paused: "paused",
  running: "running",
  waiting: "waiting",
  blocked: "blocked",
  failed: "failed",
  completed: "completed",
  cancelled: "cancelled",
};

export async function recordRunEvent(
  tx: Executor,
  run: RunRow,
  type: ProjectEventType,
  data: Record<string, string | number | boolean | null>,
  actorId: string | null,
  batch: EventBatch,
) {
  await tx.insert(agentRunEvents).values({ runId: run.id, projectId: run.projectId, type, data });
  await batch.emit(tx, {
    type,
    projectId: run.projectId,
    actorId,
    entityType: "agent_run",
    entityId: run.id,
    data,
  });
}

/** Moves a run (and its assignment) through the state machine; invalid moves are CONFLICT. */
export async function transition(
  tx: Executor,
  run: RunRow,
  to: RunStatus,
  patch: Partial<typeof agentRuns.$inferInsert> = {},
): Promise<RunRow> {
  try {
    assertTransition(run.status, to);
  } catch (error) {
    if (error instanceof InvalidTransitionError) throw new AppError("CONFLICT", error.message);
    throw error;
  }
  const now = new Date();
  const terminal = to === "completed" || to === "failed" || to === "cancelled";
  const [row] = await tx
    .update(agentRuns)
    .set({
      ...patch,
      status: to,
      ...(to === "running" && !run.startedAt ? { startedAt: now } : {}),
      ...(terminal ? { completedAt: now } : {}),
    })
    .where(eq(agentRuns.id, run.id))
    .returning();
  // A finished run settles the skills it carried and may yield a proposal for a new one.
  if (to === "completed") {
    await settleRunUsages(tx, run.id, "success");
    await enqueueSkillExtraction(tx, { projectId: run.projectId, runId: run.id });
  } else if (to === "failed") {
    await settleRunUsages(tx, run.id, "failure");
  }
  if (run.assignmentId)
    await tx
      .update(agentAssignments)
      .set({
        status: ASSIGNMENT_FOR[to],
        ...(to === "running" ? { startedAt: now } : {}),
        ...(terminal ? { completedAt: now } : {}),
      })
      .where(eq(agentAssignments.id, run.assignmentId));
  return row;
}

export async function lockRun(tx: Tx, access: ProjectAccess, runId: string) {
  const [row] = await tx
    .select({ run: agentRuns, agent: agents, taskTitle: tasks.title })
    .from(agentRuns)
    .innerJoin(agents, eq(agents.id, agentRuns.agentId))
    .leftJoin(tasks, eq(tasks.id, agentRuns.taskId))
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.projectId, access.project.id)))
    .for("update", { of: agentRuns });
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

export const meta = (
  agent: AgentRow,
  title: string | null,
  extra: Record<string, string> = {},
) => ({
  agent: agent.name,
  title: title ?? "",
  ...extra,
});

export async function cancelRunTx(
  tx: Executor,
  access: ProjectAccess,
  run: RunRow,
  agent: AgentRow,
  title: string | null,
  batch: EventBatch,
) {
  const next = await transition(tx, run, "cancelled");
  await cancelPendingProposals(tx, run.id, batch, access);
  await recordRunEvent(
    tx,
    next,
    "AGENT_CANCELLED",
    meta(agent, title, { simulated: "true" }),
    access.actor.id,
    batch,
  );
}

export async function cancelPendingProposals(
  tx: Executor,
  runId: string,
  batch: EventBatch,
  access: ProjectAccess,
) {
  const cancelled = await tx
    .update(proposals)
    .set({ status: "cancelled" })
    .where(and(eq(proposals.runId, runId), eq(proposals.status, "pending")))
    .returning({ id: proposals.id, title: proposals.title });
  for (const p of cancelled)
    await batch.emit(tx, {
      type: "PROPOSAL_CANCELLED",
      projectId: access.project.id,
      actorId: access.actor.id,
      entityType: "proposal",
      entityId: p.id,
      data: { title: p.title },
    });
}
