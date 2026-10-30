import "server-only";
import { and, count, eq, max } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Tx } from "@/lib/db/client";
import { executionArtifacts, taskDependencies, tasks } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { EventBatch } from "@/lib/events/emitter";
import { log } from "@/lib/log";
import { scrubSecrets } from "@/lib/secrets/scan";
import { appendEvent } from "./events";
import { backoffMs, enqueueDispatch, enqueueJob } from "./jobs";
import { moveTask } from "./lifecycle";
import { type MessageParty, postMessage } from "./messages";
import { assignForExecution, endRun, latestRun } from "./runs";
import { type TeamMember } from "./snapshot";
import type { ArtifactInput, TaskResult } from "./task-executor";
import { type ExecutionRow, scopeOf, type TaskRow } from "./types";

const party = (m: TeamMember): MessageParty => ({
  id: m.agent.id,
  definitionKey: m.definition.key,
  handoffTargets: m.definition.handoffTargets,
});

export interface Concluding {
  tx: Tx;
  access: ProjectAccess;
  execution: ExecutionRow;
  task: TaskRow;
  member: TeamMember;
  team: TeamMember[];
  attempt: number;
  runId: string | null;
  batch: EventBatch;
}

/** Stores what the agent produced and announces it. A commit is the only thing that says code changed. */
export async function storeArtifacts(c: Concluding, artifacts: ArtifactInput[]): Promise<string[]> {
  const ids: string[] = [];
  for (const a of artifacts) {
    const [row] = await c.tx
      .insert(executionArtifacts)
      .values({
        projectId: c.execution.projectId,
        executionId: c.execution.id,
        taskId: c.task.id,
        runId: c.runId,
        kind: a.kind,
        path: a.path ?? null,
        commitSha: a.commitSha ?? null,
        summary: scrubSecrets(a.summary).slice(0, 1000),
        data: a.data ?? {},
      })
      .returning({ id: executionArtifacts.id });
    ids.push(row.id);
    const scope = scopeOf(c.execution);
    const base = { artifactId: row.id, taskId: c.task.id, kind: a.kind, path: a.path ?? null };
    await appendEvent(c.tx, scope, "artifact.created", base);
    if (a.kind === "file_change") await appendEvent(c.tx, scope, "file.changed", base);
    if (a.kind === "commit") {
      await appendEvent(c.tx, scope, "git.operation_completed", {
        ...base,
        operation: "commit",
        commitSha: a.commitSha ?? null,
        branch: c.execution.branch,
      });
      await appendEvent(c.tx, scope, "code.diff_updated", {
        taskId: c.task.id,
        commitSha: a.commitSha ?? null,
        branch: c.execution.branch,
      });
    }
  }
  return ids;
}

export async function concludeSucceeded(
  c: Concluding,
  result: Extract<TaskResult, { outcome: "succeeded" }>,
) {
  const ids = await storeArtifacts(c, result.artifacts);
  await postMessage(c.tx, scopeOf(c.execution), {
    taskId: c.task.id,
    from: party(c.member),
    to: null,
    type: "completion",
    body: result.summary,
    artifactRefs: ids,
    key: `done:${c.task.id}:${c.attempt}`,
  });
  for (const [i, m] of (result.messages ?? []).entries()) {
    const target = c.team.find((t) => t.definition.key === m.to);
    try {
      await postMessage(c.tx, scopeOf(c.execution), {
        taskId: c.task.id,
        from: party(c.member),
        to: target ? { id: target.agent.id, definitionKey: target.definition.key } : null,
        type: m.type,
        body: m.body,
        key: `msg:${c.task.id}:${c.attempt}:${i}`,
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // An agent may not hand work to someone its definition does not list: say it, do not do it.
      await appendEvent(c.tx, scopeOf(c.execution), "task.progress", {
        taskId: c.task.id,
        warning: error.code === "AUTHORIZATION_ERROR" ? "handoff_refused" : "message_refused",
        to: m.to,
      });
    }
  }
  if (c.runId)
    await endRun(
      c.tx,
      c.access,
      c.runId,
      "completed",
      { output: { summary: result.summary, artifacts: ids.length } },
      c.batch,
    );
  await moveTask(c.tx, c.task, "succeeded", {
    agentId: c.member.agent.id,
    extra: { artifacts: ids.length },
  });
  await enqueueDispatch(c.tx, scopeOf(c.execution));
}

/** The error text a person may see: no secrets, no stack, bounded. */
export const safeError = (error: unknown): string =>
  error instanceof AppError
    ? error.code
    : typeof error === "string"
      ? scrubSecrets(error).slice(0, 300)
      : "executor_error";

export async function concludeFailed(
  c: Concluding,
  result: Extract<TaskResult, { outcome: "failed" }>,
) {
  const error = scrubSecrets(result.error).slice(0, 300);
  const allowed = Math.min(c.member.definition.maxAttempts, c.execution.budget.maxRetries + 1);
  const retry = result.retryable && c.attempt < allowed;
  if (c.runId) await endRun(c.tx, c.access, c.runId, "failed", { error }, c.batch);
  const failed = await moveTask(c.tx, c.task, "failed", {
    agentId: c.member.agent.id,
    reason: error,
    extra: { attempt: c.attempt, retrying: retry },
  });
  await postMessage(c.tx, scopeOf(c.execution), {
    taskId: c.task.id,
    from: party(c.member),
    to: null,
    type: "failure",
    body: retry ? `Attempt ${c.attempt} failed: ${error}. Trying again.` : `Failed: ${error}`,
    key: `fail:${c.task.id}:${c.attempt}`,
  });
  if (retry) {
    // A new run for the next try; the failed one stays as history. A retry never repeats a commit
    // that already landed: the executor is given the last error and the work already done.
    const next = c.attempt + 1;
    const queued = await moveTask(c.tx, failed, "queued", {
      agentId: c.member.agent.id,
      extra: { attempt: next },
    });
    await assignForExecution(c.tx, c.access, c.execution, queued, c.member.agent.id, next, c.batch);
    await enqueueJob(c.tx, {
      ...scopeOf(c.execution),
      kind: "run_task",
      taskId: queued.id,
      key: `run:${queued.id}:${next}`,
      runAfter: new Date(Date.now() + backoffMs(c.attempt)),
    });
    return;
  }
  await enqueueDispatch(c.tx, scopeOf(c.execution));
}

/**
 * A reviewer found defects. Its own task is done (it delivered a verdict); the author gets the
 * findings and a new "revise" task, and the review runs again after it. Every new task counts
 * against the budget, so two agents cannot send work back and forth without end.
 */
export async function concludeReviewFailed(
  c: Concluding,
  result: Extract<TaskResult, { outcome: "review_failed" }>,
) {
  const scope = scopeOf(c.execution);
  const ids = await storeArtifacts(c, [
    ...(result.artifacts ?? []),
    {
      kind: "test_result",
      summary: result.summary,
      data: {
        verdict: "fail",
        findings: result.findings.slice(0, 2000),
        targetTaskId: result.targetTaskId,
      },
    },
  ]);
  const [target] = await c.tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, result.targetTaskId), eq(tasks.executionId, c.execution.id)));
  const [{ total }] = await c.tx
    .select({ total: count() })
    .from(tasks)
    .where(eq(tasks.executionId, c.execution.id));
  // How many times work has already been sent back along this line: the longer of the two chains.
  const depth = async (from: TaskRow | undefined) => {
    let n = 0;
    for (let t = from; t?.parentTaskId; n++)
      [t] = await c.tx.select().from(tasks).where(eq(tasks.id, t.parentTaskId));
    return n;
  };
  const revisions = Math.max(await depth(target), await depth(c.task));
  const room =
    target && total + 2 <= c.execution.budget.maxTasks && revisions < c.execution.budget.maxRetries;
  if (c.runId)
    await endRun(
      c.tx,
      c.access,
      c.runId,
      room ? "completed" : "failed",
      { output: { verdict: "fail" }, ...(room ? {} : { error: "review_failed" }) },
      c.batch,
    );
  if (!room || !target) {
    await moveTask(c.tx, c.task, "failed", {
      agentId: c.member.agent.id,
      reason: "review_failed_no_budget",
    });
    await postMessage(c.tx, scope, {
      taskId: c.task.id,
      from: party(c.member),
      to: null,
      type: "failure",
      body: `Review failed and the execution has no room for another revision: ${result.findings}`,
      key: `fail:${c.task.id}:${c.attempt}`,
    });
    await enqueueDispatch(c.tx, scope);
    return;
  }
  const targetRun = await latestRun(c.tx, target);
  const author =
    c.team.find((m) => m.agent.id === targetRun?.agentId) ??
    c.team.find((m) => m.definition.role === target.roleKey);
  const [{ last }] = await c.tx
    .select({ last: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.projectId, c.execution.projectId));
  const position = last ?? 0;
  const [revise, recheck] = await c.tx
    .insert(tasks)
    .values([
      {
        projectId: c.execution.projectId,
        title: `Revise: ${target.title}`.slice(0, 140),
        description: scrubSecrets(`Fix what the review found.\n\n${result.findings}`).slice(
          0,
          1500,
        ),
        status: "todo" as const,
        priority: target.priority,
        source: "agent" as const,
        position: position + 1,
        executionId: c.execution.id,
        executionStatus: "pending" as const,
        roleKey: target.roleKey,
        acceptanceCriteria: target.acceptanceCriteria,
        targetPaths: target.targetPaths,
        planVersion: target.planVersion,
        parentTaskId: target.id,
      },
      {
        projectId: c.execution.projectId,
        title: `Re-check: ${c.task.title}`.slice(0, 140),
        description: c.task.description,
        status: "todo" as const,
        priority: c.task.priority,
        source: "agent" as const,
        position: position + 2,
        executionId: c.execution.id,
        executionStatus: "pending" as const,
        roleKey: c.task.roleKey,
        acceptanceCriteria: c.task.acceptanceCriteria,
        targetPaths: c.task.targetPaths,
        planVersion: c.task.planVersion,
        parentTaskId: c.task.id,
      },
    ])
    .returning();
  // The re-check waits for the revision and looks at the same work as the review it repeats.
  const reviewed = await c.tx
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, c.task.id));
  await c.tx
    .insert(taskDependencies)
    .values(
      [revise.id, ...reviewed.map((e) => e.dependsOnId)].map((dependsOnId) => ({
        taskId: recheck.id,
        dependsOnId,
      })),
    )
    .onConflictDoNothing();
  // Whatever was waiting for this review now waits for the re-check as well.
  const waiting = await c.tx
    .select({ id: tasks.id })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .where(and(eq(taskDependencies.dependsOnId, c.task.id), eq(tasks.executionStatus, "pending")));
  if (waiting.length > 0)
    await c.tx
      .insert(taskDependencies)
      .values(waiting.map((w) => ({ taskId: w.id, dependsOnId: recheck.id })))
      .onConflictDoNothing();
  for (const t of [revise, recheck])
    await appendEvent(c.tx, scope, "task.created", {
      taskId: t.id,
      title: t.title,
      role: t.roleKey,
      parentTaskId: t.parentTaskId,
      revision: true,
    });
  const to = author ? { id: author.agent.id, definitionKey: author.definition.key } : null;
  const body = `Review of "${target.title}" found defects:\n${result.findings}`;
  try {
    await postMessage(c.tx, scope, {
      taskId: revise.id,
      from: party(c.member),
      to,
      type: "review_feedback",
      body,
      artifactRefs: ids,
      key: `feedback:${c.task.id}:${c.attempt}`,
    });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    // The reviewer may not message that agent directly: the orchestrator passes the finding on.
    await postMessage(c.tx, scope, {
      taskId: revise.id,
      from: null,
      to,
      type: "review_feedback",
      body,
      artifactRefs: ids,
      key: `feedback:${c.task.id}:${c.attempt}`,
    });
  }
  await moveTask(c.tx, c.task, "succeeded", {
    agentId: c.member.agent.id,
    extra: { verdict: "fail", revision: revise.id },
  });
  await enqueueDispatch(c.tx, scope);
  log.info("execution.revision_created", { executionId: c.execution.id });
}
