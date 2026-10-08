import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { getAssistantCopy } from "@/lib/assistant/copy";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor, type Tx } from "@/lib/db/client";
import {
  agentAssignments,
  agentRunEvents,
  agentRuns,
  agents,
  documents,
  proposals,
  requirements,
  tasks,
} from "@/lib/db/schema";
import type { AssignmentStatus, RunStatus } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import type { ProjectEventType, Trace } from "@/lib/events/types";
import { log } from "@/lib/log";
import { createProposalTx } from "@/lib/proposals/repository";
import { parse } from "@/lib/validation";
import { executeAgent } from "./execute-agent";
import type { AgentExecutionResult } from "./executor";
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

/** Words longer than three letters, for matching requirements to a task. */
const keywords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9À-ɏ]+/)
    .filter((w) => w.length > 3);

/**
 * Runs a queued run to its next resting state. Safe to call twice: only a queued run starts,
 * and a run cancelled while executing keeps its cancelled state (the result is discarded).
 */
export async function startRun(access: ProjectAccess, runId: string): Promise<void> {
  const batch = new EventBatch();
  const started = await db.transaction(async (tx) => {
    const { run, agent, taskTitle } = await lockRun(tx, access, runId);
    if (run.status !== "queued") return null;
    const next = await transition(tx, run, "running");
    await tx.update(agents).set({ lastUsedAt: new Date() }).where(eq(agents.id, agent.id));
    await recordRunEvent(tx, next, "AGENT_STARTED", meta(agent, taskTitle), access.actor.id, batch);
    return { run: next, agent };
  });
  batch.flush();
  if (!started) return;
  const { run, agent } = started;
  const locale = access.project.locale as Locale;

  const [task] = run.taskId ? await db.select().from(tasks).where(eq(tasks.id, run.taskId)) : [];
  const [prd] = await db
    .select({ content: documents.content })
    .from(documents)
    .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, "prd")));
  const words = new Set(keywords(`${task?.title ?? ""} ${task?.description ?? ""}`));
  const related = (
    await db
      .select({ title: requirements.title, description: requirements.description })
      .from(requirements)
      .where(eq(requirements.projectId, access.project.id))
      .orderBy(asc(requirements.position))
  )
    .filter((r) => keywords(`${r.title} ${r.description}`).some((w) => words.has(w)))
    .slice(0, 10)
    .map((r) => r.title);

  const instructions = String((run.input as { instructions?: string }).instructions ?? "");
  const input = {
    locale,
    project: { name: access.project.name, slug: access.project.slug },
    agent: {
      name: agent.name,
      type: agent.type,
      role: agent.role,
      capabilities: agent.capabilities,
      permissions: agent.permissions,
    },
    task: {
      id: task?.id ?? "",
      title: task?.title ?? "",
      description: task?.description ?? "",
      priority: task?.priority ?? "medium",
    },
    instructions,
    context: { prdExcerpt: prd ? prd.content.slice(0, 4000) : null, requirements: related },
    constraints: [
      "Propose changes only; a person approves them.",
      "No repository, deployment or external calls.",
    ],
    expectedOutput: "summary, changes, artifacts, recommendations, issues",
  };

  let result: AgentExecutionResult;
  try {
    result = await executeAgent(access, run, agent, input);
  } catch (error) {
    log.error("agent.executor_failed", { runId, error: String(error) });
    result = {
      status: "failed",
      summary: getAssistantCopy(locale).agent.failedSummary,
      changes: [],
      artifacts: [],
      recommendations: [],
      issues: [],
      needsApproval: false,
      simulated: false,
      steps: [],
      error: "executor_error",
    };
  }

  const finish = new EventBatch();
  await db.transaction(async (tx) => {
    const { run: current, taskTitle } = await lockRun(tx, access, runId);
    if (current.status !== "running") return; // Cancelled meanwhile: keep that decision.
    for (const step of result.steps)
      await tx
        .insert(agentRunEvents)
        .values({ runId, projectId: current.projectId, type: "AGENT_THINKING", data: { step } });
    const output = { ...result, changes: result.changes.length } as unknown as Record<
      string,
      unknown
    >;
    const withInput = {
      input: { ...input, instructions } as unknown as Record<string, unknown>,
      output,
    };

    if (result.status === "waiting_external") {
      const next = await transition(tx, current, "waiting", {
        ...withInput,
        metadata: { ...current.metadata, handoffId: result.handoffId ?? null },
      });
      await recordRunEvent(
        tx,
        next,
        "AGENT_WAITING",
        meta(agent, taskTitle, { reason: "external" }),
        access.actor.id,
        finish,
      );
      return;
    }
    if (result.status === "failed") {
      const next = await transition(tx, current, "failed", {
        ...withInput,
        error: result.error ?? "failed",
      });
      await recordRunEvent(
        tx,
        next,
        "AGENT_FAILED",
        meta(agent, taskTitle, { reason: result.error ?? "failed" }),
        access.actor.id,
        finish,
      );
      return;
    }
    if (result.changes.length > 0) {
      const copy = getAssistantCopy(locale);
      const proposal = await createProposalTx(
        tx,
        access,
        {
          type: "agent_result",
          title: copy.proposals.agentResult(agent.name, taskTitle ?? ""),
          description: result.summary,
          actions: result.changes,
          conversationId: current.conversationId,
          runId,
        },
        finish,
      );
      const next = await transition(tx, current, "waiting", {
        ...withInput,
        proposalId: proposal.id,
      });
      await recordRunEvent(
        tx,
        next,
        "AGENT_WAITING",
        meta(agent, taskTitle),
        access.actor.id,
        finish,
      );
      return;
    }
    const next = await transition(tx, current, "completed", withInput);
    await recordRunEvent(
      tx,
      next,
      "AGENT_COMPLETED",
      meta(agent, taskTitle),
      access.actor.id,
      finish,
    );
  });
  finish.flush();
}

/** Called inside the approval transaction of an agent's result proposal. */
export async function resolveRunReviewTx(
  tx: Tx,
  access: ProjectAccess,
  runId: string,
  outcome: "approved" | "rejected" | "revision_requested",
  batch: EventBatch,
) {
  const { run, agent, taskTitle } = await lockRun(tx, access, runId);
  if (run.status !== "waiting") return;
  if (outcome === "approved") {
    const next = await transition(tx, run, "completed");
    await recordRunEvent(
      tx,
      next,
      "AGENT_COMPLETED",
      meta(agent, taskTitle),
      access.actor.id,
      batch,
    );
  } else if (outcome === "rejected") {
    const next = await transition(tx, run, "cancelled", {
      metadata: { ...run.metadata, review: "rejected" },
    });
    await recordRunEvent(
      tx,
      next,
      "AGENT_CANCELLED",
      meta(agent, taskTitle, { review: "rejected" }),
      access.actor.id,
      batch,
    );
  } else {
    const next = await transition(tx, run, "blocked", {
      metadata: { ...run.metadata, review: "revision_requested" },
    });
    await recordRunEvent(
      tx,
      next,
      "AGENT_BLOCKED",
      meta(agent, taskTitle, { review: "revision_requested" }),
      access.actor.id,
      batch,
    );
  }
}
