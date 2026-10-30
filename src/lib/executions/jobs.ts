import "server-only";
import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { executionJobs, executions } from "@/lib/db/schema";
import type { ExecutionJobKind } from "@/lib/domain/executions";

export type JobRow = typeof executionJobs.$inferSelect;

/** How long a worker owns a job. A worker that dies leaves it; the next drain takes it over. */
export const JOB_LOCK_MS = 6 * 60_000;
/** A job that fails this many times stays failed. */
export const MAX_JOB_ATTEMPTS = 4;

/** Idempotent: asking twice for the same step queues one job. */
export async function enqueueJob(
  executor: Executor,
  input: {
    projectId: string;
    executionId: string;
    kind: ExecutionJobKind;
    taskId?: string | null;
    key: string;
    runAfter?: Date;
  },
): Promise<boolean> {
  const rows = await executor
    .insert(executionJobs)
    .values({
      projectId: input.projectId,
      executionId: input.executionId,
      kind: input.kind,
      taskId: input.taskId ?? null,
      idempotencyKey: input.key,
      ...(input.runAfter ? { runAfter: input.runAfter } : {}),
    })
    .onConflictDoNothing()
    .returning({ id: executionJobs.id });
  return rows.length > 0;
}

/**
 * Takes up to `limit` due jobs for this worker. Rows another worker holds are skipped, not
 * waited for, so several drains can run side by side without taking the same job twice. A
 * job still marked running after its lock expired belongs to a dead worker and is taken over.
 */
export async function claimJobs(limit: number, now = new Date()): Promise<JobRow[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: executionJobs.id })
      .from(executionJobs)
      .where(
        or(
          and(eq(executionJobs.status, "pending"), lte(executionJobs.runAfter, now)),
          and(eq(executionJobs.status, "running"), lt(executionJobs.lockedUntil, now)),
        ),
      )
      .orderBy(asc(executionJobs.runAfter))
      .limit(limit)
      .for("update", { skipLocked: true });
    const claimed: JobRow[] = [];
    for (const { id } of due) {
      const [job] = await tx
        .update(executionJobs)
        .set({
          status: "running",
          attempts: sql`${executionJobs.attempts} + 1`,
          lockedUntil: new Date(now.getTime() + JOB_LOCK_MS),
        })
        .where(eq(executionJobs.id, id))
        .returning();
      claimed.push(job);
    }
    return claimed;
  });
}

export async function finishJob(id: string) {
  await db
    .update(executionJobs)
    .set({ status: "done", lockedUntil: null, lastError: null })
    .where(eq(executionJobs.id, id));
}

/** Puts a failed job back for another try after a delay, or leaves it failed when it ran out of tries. */
export async function failJob(job: JobRow, error: string) {
  const exhausted = job.attempts >= MAX_JOB_ATTEMPTS;
  await db
    .update(executionJobs)
    .set({
      status: exhausted ? "failed" : "pending",
      lockedUntil: null,
      lastError: error.slice(0, 500),
      runAfter: new Date(Date.now() + backoffMs(job.attempts)),
    })
    .where(eq(executionJobs.id, job.id));
}

/** 5 s, 20 s, 80 s, ...: long enough for a provider to recover, short enough for a person to wait. */
export const backoffMs = (attempt: number) => 5_000 * 4 ** Math.max(0, attempt - 1);

/**
 * Asks for the next dispatch round. The key carries the execution's event number, so each
 * state change queues one round and a repeated call for the same change queues none.
 */
export async function enqueueDispatch(
  executor: Executor,
  scope: { executionId: string; projectId: string },
): Promise<boolean> {
  const [row] = await executor
    .select({ seq: executions.seq })
    .from(executions)
    .where(eq(executions.id, scope.executionId));
  return enqueueJob(executor, { ...scope, kind: "dispatch", key: `dispatch:${row?.seq ?? 0}` });
}
