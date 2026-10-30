import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { activeDefinitions } from "@/lib/agent-definitions/service";
import { ensureTeamAgents } from "@/lib/agents/registry";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { conversations, executions, tasks } from "@/lib/db/schema";
import { DEFAULT_EXECUTION_BUDGET, EXECUTION_MODES } from "@/lib/domain/executions";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { allow } from "@/lib/rate-limit";
import { parse } from "@/lib/validation";
import { cancelIdleTasks, settleCancellation } from "./cancel";
import { appendEvent } from "./events";
import { enqueueDispatch, enqueueJob } from "./jobs";
import { moveExecution, moveTask } from "./lifecycle";
import { scheduleDrain } from "./schedule";
import { toDefinitionSnapshot } from "./snapshot";
import { type ExecutionRow, scopeOf } from "./types";

/** Executions a project may have open at once. */
export const MAX_OPEN_EXECUTIONS = 3;
const OPEN = [
  "queued",
  "planning",
  "planned",
  "running",
  "waiting_approval",
  "cancelling",
] as const;

const startInput = z.object({
  mode: z.enum(EXECUTION_MODES),
  request: z.string().trim().min(3).max(4000),
  conversationId: z.uuid().nullish(),
  messageId: z.uuid().nullish(),
});

const reviseInput = z.object({ request: z.string().trim().min(3).max(4000) });

const lockExecution = async (tx: Tx, access: ProjectAccess, id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND");
  const [row] = await tx
    .select()
    .from(executions)
    .where(and(eq(executions.id, id), eq(executions.projectId, access.project.id)))
    .for("update");
  if (!row) throw new AppError("NOT_FOUND");
  return row;
};

async function addPlanningTask(tx: Tx, execution: ExecutionRow) {
  const [task] = await tx
    .insert(tasks)
    .values({
      projectId: execution.projectId,
      title: "Plan the work",
      description: execution.request.slice(0, 500),
      status: "todo",
      source: "agent",
      phase: "plan",
      executionId: execution.id,
      executionStatus: "queued",
      roleKey: "planner",
      planVersion: execution.planVersion,
    })
    .returning();
  await appendEvent(tx, scopeOf(execution), "task.created", {
    taskId: task.id,
    title: task.title,
    role: "planner",
    phase: "plan",
  });
  return task;
}

/**
 * Starts planning (and, in build mode, the work that follows) for a request. It returns at once:
 * a worker does the rest. The agents are the ones active now, frozen for this execution.
 */
export async function startExecution(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<ExecutionRow> {
  const data = parse(startInput, input);
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (!(await allow(`execution:start:${access.project.id}`, 20, 3_600_000)))
    throw new AppError("RATE_LIMIT");
  const row = await db.transaction(async (tx) => {
    if (data.conversationId) {
      const [mine] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, data.conversationId),
            eq(conversations.projectId, access.project.id),
            eq(conversations.userId, actor.id),
          ),
        );
      if (!mine) throw new AppError("NOT_FOUND");
    }
    const [{ open }] = await tx
      .select({ open: count() })
      .from(executions)
      .where(
        and(eq(executions.projectId, access.project.id), inArray(executions.status, [...OPEN])),
      );
    if (open >= MAX_OPEN_EXECUTIONS)
      throw new AppError("CONFLICT", "Too many open executions", { execution: "tooMany" });
    await ensureTeamAgents(tx, access.project.id);
    const definitions = await activeDefinitions(tx);
    if (definitions.length === 0)
      throw new AppError("VALIDATION_ERROR", "No active agents", { agents: "none" });
    const [execution] = await tx
      .insert(executions)
      .values({
        projectId: access.project.id,
        conversationId: data.conversationId ?? null,
        messageId: data.messageId ?? null,
        mode: data.mode,
        request: data.request,
        budget: DEFAULT_EXECUTION_BUDGET,
        agentSnapshot: {
          definitions: Object.fromEntries(definitions.map((d) => [d.id, toDefinitionSnapshot(d)])),
        },
        createdBy: actor.id,
      })
      .returning();
    await appendEvent(tx, scopeOf(execution), "execution.created", {
      mode: data.mode,
      request: data.request.slice(0, 300),
    });
    await addPlanningTask(tx, execution);
    await enqueueJob(tx, { ...scopeOf(execution), kind: "plan", key: "plan:1" });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "execution.started",
      entityType: "execution",
      entityId: execution.id,
      metadata: { mode: data.mode },
    });
    return execution;
  });
  scheduleDrain();
  return row;
}

/**
 * Asks an execution to stop. Work nobody is doing stops now; a task a worker is running keeps
 * the execution in `cancelling` until that worker returns, so "cancelled" is never claimed early.
 */
export async function cancelExecution(
  actor: Actor,
  slug: string,
  executionId: string,
): Promise<ExecutionRow> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const batch = new EventBatch();
  const row = await db.transaction(async (tx) => {
    const execution = await lockExecution(tx, access, executionId);
    if (["succeeded", "failed", "cancelled", "cancelling"].includes(execution.status))
      return execution;
    const next = await moveExecution(
      tx,
      execution,
      execution.status === "planned" ? "cancelled" : "cancelling",
      { patch: { cancelRequestedAt: new Date() } },
    );
    await cancelIdleTasks(tx, access, next, "cancelled_by_user", batch);
    const settled = await settleCancellation(tx, next);
    await enqueueDispatch(tx, scopeOf(settled));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "execution.cancel_requested",
      entityType: "execution",
      entityId: execution.id,
    });
    return settled;
  });
  batch.flush();
  scheduleDrain();
  return row;
}

/**
 * Another go at a failed or blocked task, after a person decided so. Tasks that were held
 * behind it are released and checked again. A finished (failed) execution runs again.
 */
export async function retryTask(
  actor: Actor,
  slug: string,
  executionId: string,
  taskId: string,
): Promise<void> {
  if (!z.uuid().safeParse(taskId).success) throw new AppError("NOT_FOUND");
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  await db.transaction(async (tx) => {
    const execution = await lockExecution(tx, access, executionId);
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.executionId, execution.id)))
      .for("update");
    if (!task) throw new AppError("NOT_FOUND");
    if (task.executionStatus !== "failed" && task.executionStatus !== "blocked")
      throw new AppError("CONFLICT", "Task cannot be retried", { task: "notRetryable" });
    if (
      execution.status !== "failed" &&
      execution.status !== "running" &&
      execution.status !== "waiting_approval"
    )
      throw new AppError("CONFLICT", "Execution is not open", { execution: "notOpen" });
    await moveTask(tx, task, "pending", { reason: null, extra: { retry: true } });
    const held = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.executionId, execution.id),
          eq(tasks.executionStatus, "blocked"),
          eq(tasks.blockedReason, "dependency_failed"),
        ),
      );
    for (const t of held) await moveTask(tx, t, "pending", { extra: { released: true } });
    if (execution.status === "failed")
      await moveExecution(tx, execution, "running", { patch: { errorSummary: null } });
    await enqueueDispatch(tx, scopeOf(execution));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "execution.task_retried",
      entityType: "execution",
      entityId: execution.id,
      metadata: { taskId },
    });
  });
  scheduleDrain();
}

/** "Build this plan": a planned execution starts its work on a work branch. */
export async function buildFromPlan(
  actor: Actor,
  slug: string,
  executionId: string,
): Promise<ExecutionRow> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const row = await db.transaction(async (tx) => {
    const execution = await lockExecution(tx, access, executionId);
    if (execution.status !== "planned")
      throw new AppError("CONFLICT", "Nothing to build", { execution: "notPlanned" });
    const next = await moveExecution(tx, execution, "running", {
      patch: { mode: "build", branch: `saqina/exec-${execution.id.slice(0, 8)}` },
    });
    await enqueueDispatch(tx, scopeOf(next));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "execution.build_started",
      entityType: "execution",
      entityId: execution.id,
    });
    return next;
  });
  scheduleDrain();
  return row;
}

/**
 * Changes a plan that has not been built. The old version is kept in the history (its tasks are
 * cancelled as superseded) and a new version is planned; a plan being built is never rewritten.
 */
export async function revisePlan(
  actor: Actor,
  slug: string,
  executionId: string,
  input: unknown,
): Promise<ExecutionRow> {
  const data = parse(reviseInput, input);
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const batch = new EventBatch();
  const row = await db.transaction(async (tx) => {
    const execution = await lockExecution(tx, access, executionId);
    if (execution.status !== "planned")
      throw new AppError("CONFLICT", "Plan is being built", { execution: "notPlanned" });
    await cancelIdleTasks(tx, access, execution, "superseded", batch);
    const next = await moveExecution(tx, execution, "planning", {
      patch: { request: data.request, planVersion: execution.planVersion + 1 },
    });
    await addPlanningTask(tx, next);
    await enqueueJob(tx, { ...scopeOf(next), kind: "plan", key: `plan:${next.planVersion}` });
    return next;
  });
  batch.flush();
  scheduleDrain();
  return row;
}

export async function listExecutions(
  actor: Actor,
  slug: string,
  limit = 20,
): Promise<ExecutionRow[]> {
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  return db
    .select()
    .from(executions)
    .where(eq(executions.projectId, access.project.id))
    .orderBy(desc(executions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}
