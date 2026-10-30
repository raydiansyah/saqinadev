import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { executionEvents, executions } from "@/lib/db/schema";
import type { ExecutionEventType } from "@/lib/domain/executions";
import { AppError } from "@/lib/errors";
import { scrubValue } from "@/lib/secrets/scan";

export type ExecutionEventRow = typeof executionEvents.$inferSelect;

const MAX_TEXT = 2000;

/** Secrets out, long text cut: an event is a notice, the full text lives in its own row. */
function clean(value: unknown, depth = 0): unknown {
  if (typeof value === "string")
    return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, depth + 1)]));
}

/**
 * Writes one event and gives it the next number of its execution. The number comes from the
 * execution row, locked by the same statement, so two writers never share one and a reader
 * that saw event N has seen every event before it. Call it in the transaction of the change
 * it describes: the event exists if and only if the change does.
 */
export async function appendEvent(
  tx: Executor,
  scope: { executionId: string; projectId: string },
  type: ExecutionEventType,
  payload: Record<string, unknown> = {},
): Promise<{ id: string; seq: number }> {
  const [next] = await tx
    .update(executions)
    .set({ seq: sql`${executions.seq} + 1` })
    .where(and(eq(executions.id, scope.executionId), eq(executions.projectId, scope.projectId)))
    .returning({ seq: executions.seq });
  if (!next) throw new AppError("NOT_FOUND");
  const [row] = await tx
    .insert(executionEvents)
    .values({
      projectId: scope.projectId,
      executionId: scope.executionId,
      seq: next.seq,
      type,
      payload: clean(scrubValue(payload)) as Record<string, unknown>,
    })
    .returning({ id: executionEvents.id, seq: executionEvents.seq });
  return row;
}

/** Events after `afterSeq`, oldest first. A client that reconnects asks with the last number it saw. */
export async function listEventsSince(
  executor: Executor,
  scope: { executionId: string; projectId: string },
  afterSeq: number,
  limit = 200,
): Promise<ExecutionEventRow[]> {
  return executor
    .select()
    .from(executionEvents)
    .where(
      and(
        eq(executionEvents.executionId, scope.executionId),
        eq(executionEvents.projectId, scope.projectId),
        gt(executionEvents.seq, afterSeq),
      ),
    )
    .orderBy(asc(executionEvents.seq))
    .limit(Math.min(Math.max(limit, 1), 500));
}
