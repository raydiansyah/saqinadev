import "server-only";
import * as z from "zod";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { parse } from "@/lib/validation";
import {
  assignAgentTx,
  cancelPendingProposals,
  cancelRunTx,
  lockRun,
  meta,
  recordRunEvent,
  startRun,
  transition,
} from "./orchestrator";

/** User controls for agent runs: cancel, retry, pause, resume and reassign. */

const runInput = z.object({ runId: z.uuid() });

async function withRun<T>(
  actor: Actor,
  slug: string,
  input: unknown,
  body: (
    tx: Tx,
    access: ProjectAccess,
    row: Awaited<ReturnType<typeof lockRun>>,
    batch: EventBatch,
  ) => Promise<T>,
): Promise<{ access: ProjectAccess; value: T }> {
  const { runId } = parse(runInput, input);
  const batch = new EventBatch();
  const out = await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const row = await lockRun(tx, access, runId);
    return { access, value: await body(tx, access, row, batch) };
  });
  batch.flush();
  return out;
}

/** Stops a run. For simulated runs there is no external process; the state says so. */
export async function cancelRun(actor: Actor, slug: string, input: unknown) {
  await withRun(actor, slug, input, (tx, access, { run, agent, taskTitle }, batch) =>
    cancelRunTx(tx, access, run, agent, taskTitle, batch),
  );
}

/** Retries the same run (attempt + 1). Any proposal from the earlier attempt is cancelled. */
export async function retryRun(actor: Actor, slug: string, input: unknown) {
  const { access, value: runId } = await withRun(
    actor,
    slug,
    input,
    async (tx, access, { run }, batch) => {
      await cancelPendingProposals(tx, run.id, batch, access);
      await transition(tx, run, "queued", {
        attempt: run.attempt + 1,
        error: null,
        output: null,
        startedAt: null,
        completedAt: null,
        proposalId: null,
      });
      return run.id;
    },
  );
  await startRun(access, runId);
}

export async function pauseRun(actor: Actor, slug: string, input: unknown) {
  await withRun(actor, slug, input, async (tx, access, { run, agent, taskTitle }, batch) => {
    const next = await transition(tx, run, "paused");
    await recordRunEvent(tx, next, "AGENT_PAUSED", meta(agent, taskTitle), access.actor.id, batch);
  });
}

export async function resumeRun(actor: Actor, slug: string, input: unknown) {
  const { access } = await withRun(actor, slug, input, (tx, _a, { run }) =>
    transition(tx, run, "queued"),
  );
  await startRun(access, parse(runInput, input).runId);
}

const reassignInput = z.object({
  runId: z.uuid(),
  agentId: z.uuid(),
  instructions: z.string().trim().max(2000).optional(),
});

/** Hands the task to another agent (or the same one with new instructions) and starts it. */
export async function reassignRun(actor: Actor, slug: string, input: unknown) {
  const data = parse(reassignInput, input);
  const batch = new EventBatch();
  const { access, runId } = await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const { run } = await lockRun(tx, access, data.runId);
    if (!run.taskId) throw new AppError("VALIDATION_ERROR", "Run has no task");
    const instructions =
      data.instructions ?? String((run.input as { instructions?: string }).instructions ?? "");
    const { runId } = await assignAgentTx(
      tx,
      access,
      { taskId: run.taskId, agentId: data.agentId, instructions },
      { via: "user", conversationId: run.conversationId },
      batch,
    );
    return { access, runId };
  });
  batch.flush();
  await startRun(access, runId);
  return { runId };
}

/** Closes a run that waited on an external agent, once its result is imported or marked. */
export async function finishExternalRun(
  access: ProjectAccess,
  runId: string,
  succeeded: boolean,
  result: { summary: string; issues: string[]; changes: string[] } | null,
) {
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const { run, agent, taskTitle } = await lockRun(tx, access, runId);
    if (run.status !== "waiting") return;
    const output = { ...(run.output ?? {}), external: result ?? null, simulated: false };
    const next = await transition(tx, run, succeeded ? "completed" : "failed", {
      output,
      ...(succeeded ? {} : { error: "external_failed" }),
    });
    await recordRunEvent(
      tx,
      next,
      succeeded ? "AGENT_COMPLETED" : "AGENT_FAILED",
      meta(agent, taskTitle, { reason: "external" }),
      access.actor.id,
      batch,
    );
  });
  batch.flush();
}
