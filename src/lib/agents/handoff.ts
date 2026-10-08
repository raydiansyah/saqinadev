import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { buildContextPackage, renderPackage } from "@/lib/context/package";
import { db } from "@/lib/db/client";
import { agentHandoffs, agents, tasks } from "@/lib/db/schema";
import { HANDOFF_FORMATS } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { withSecret } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import { AGENT_ADAPTERS } from "./external/adapters";
import { type AgentResult, parseAgentResult } from "./external/result";

export type HandoffRow = typeof agentHandoffs.$inferSelect;

const target = z.object({
  agentId: z.uuid(),
  taskId: z.uuid().nullish(),
  instructions: z.string().trim().max(4000).default(""),
  format: z.enum(HANDOFF_FORMATS).default("prompt"),
});

async function loadTarget(access: ProjectAccess, data: z.infer<typeof target>) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, data.agentId), eq(agents.projectId, access.project.id)));
  if (!agent || agent.type === "saqina") throw new AppError("NOT_FOUND");
  if (agent.status === "disabled")
    throw new AppError("VALIDATION_ERROR", "Agent disabled", { agentId: "disabled" });
  const [task] = data.taskId
    ? await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, data.taskId), eq(tasks.projectId, access.project.id)))
    : [];
  if (data.taskId && !task) throw new AppError("NOT_FOUND");
  const pkg = await buildContextPackage(access, {
    agent: { permissions: agent.permissions },
    task: task ?? null,
    instructions: data.instructions,
  });
  return { agent, task: task ?? null, pkg };
}

/** Exactly what would be sent, before anything is stored or sent. */
export async function previewHandoff(actor: Actor, slug: string, input: unknown) {
  const data = parse(target, input);
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const { agent, pkg } = await loadTarget(access, data);
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      strategy: agent.connectionStrategy,
      connectionStatus: agent.connectionStatus,
    },
    meta: pkg.meta,
    files: pkg.files.map((f) => ({ name: f.name, bytes: f.content.length })),
    excluded: pkg.excluded,
    redactions: pkg.redactions,
    canDispatch:
      AGENT_ADAPTERS[agent.connectionStrategy].canDispatch &&
      agent.connectionStatus === "connected",
  };
}

/**
 * Creates the handoff (the user's confirmation after the preview is the approval). Webhook
 * agents get it sent; everyone else gets an export to copy or download. Idempotent by key.
 */
export async function createHandoff(
  actor: Actor,
  slug: string,
  input: unknown,
  options: { runId?: string | null; callbackBase?: string } = {},
): Promise<{ id: string; dispatched: boolean; code: string }> {
  const data = parse(target.extend({ idempotencyKey: z.string().min(8).max(200) }), input);
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const [existing] = await db
    .select()
    .from(agentHandoffs)
    .where(eq(agentHandoffs.idempotencyKey, data.idempotencyKey));
  if (existing) {
    if (existing.projectId !== access.project.id) throw new AppError("CONFLICT");
    return { id: existing.id, dispatched: existing.status === "sent", code: "existing" };
  }
  const { agent, task, pkg } = await loadTarget(access, data);
  const rendered = renderPackage(pkg, data.format, data.instructions);

  const batch = new EventBatch();
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(agentHandoffs)
      .values({
        projectId: access.project.id,
        agentId: agent.id,
        taskId: task?.id ?? null,
        runId: options.runId ?? null,
        contextVersion: pkg.meta.contextVersion,
        contextHash: pkg.hash,
        sourceRevision: pkg.meta.sourceRevision,
        format: data.format,
        files: pkg.files.map((f) => f.name),
        package: rendered,
        instructions: data.instructions,
        status: "generated",
        idempotencyKey: data.idempotencyKey,
        createdBy: actor.id,
      })
      .returning({ id: agentHandoffs.id });
    await batch.emit(tx, {
      type: "AGENT_HANDOFF_CREATED",
      projectId: access.project.id,
      actorId: actor.id,
      entityType: "handoff",
      entityId: row.id,
      data: {
        title: task?.title ?? access.project.name,
        agent: agent.name,
        contextVersion: pkg.meta.contextVersion,
      },
    });
    return row.id;
  });
  batch.flush();

  const adapter = AGENT_ADAPTERS[agent.connectionStrategy];
  if (
    !adapter.canDispatch ||
    agent.connectionStatus !== "connected" ||
    !agent.endpoint ||
    !agent.credentialId
  )
    return { id, dispatched: false, code: "export" };
  const endpoint = agent.endpoint;
  const credentialId = agent.credentialId;
  const result = await withSecret(
    credentialId,
    { kind: "agent", projectId: access.project.id },
    (secret) =>
      adapter.dispatch?.(endpoint, secret, {
        handoffId: id,
        project: access.project.slug,
        task: task?.title ?? null,
        instructions: data.instructions,
        contextVersion: pkg.meta.contextVersion,
        callbackUrl: `${options.callbackBase ?? process.env.BETTER_AUTH_URL ?? ""}/api/agents/callback/${id}`,
        package: rendered,
      }) ?? Promise.resolve({ ok: false, code: "unsupported" }),
  );
  // A failed send is reported as failed; the export stays available as a fallback.
  await db
    .update(agentHandoffs)
    .set({ status: result.ok ? "sent" : "failed" })
    .where(eq(agentHandoffs.id, id));
  return { id, dispatched: result.ok, code: result.code };
}

export async function getHandoff(access: ProjectAccess, id: string): Promise<HandoffRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(agentHandoffs)
    .where(and(eq(agentHandoffs.id, id), eq(agentHandoffs.projectId, access.project.id)));
  return row ?? null;
}

export async function listHandoffs(access: ProjectAccess, limit = 20) {
  return db
    .select({
      id: agentHandoffs.id,
      status: agentHandoffs.status,
      contextVersion: agentHandoffs.contextVersion,
      createdAt: agentHandoffs.createdAt,
      agentName: agents.name,
      taskTitle: tasks.title,
      runId: agentHandoffs.runId,
    })
    .from(agentHandoffs)
    .innerJoin(agents, eq(agents.id, agentHandoffs.agentId))
    .leftJoin(tasks, eq(tasks.id, agentHandoffs.taskId))
    .where(eq(agentHandoffs.projectId, access.project.id))
    .orderBy(desc(agentHandoffs.createdAt))
    .limit(limit);
}

const statusInput = z.object({
  handoffId: z.uuid(),
  status: z.enum(["sent", "completed", "cancelled"]),
});

export async function setHandoffStatus(actor: Actor, slug: string, input: unknown) {
  const data = parse(statusInput, input);
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const row = await getHandoff(access, data.handoffId);
  if (!row) throw new AppError("NOT_FOUND");
  if (["completed", "cancelled"].includes(row.status))
    throw new AppError("CONFLICT", "Already closed");
  await db.update(agentHandoffs).set({ status: data.status }).where(eq(agentHandoffs.id, row.id));
  if (row.runId && data.status !== "sent")
    await closeRun(access, row.runId, data.status === "completed");
}

/**
 * Stores the agent's own report. Called from the paste/upload form and from the signed webhook
 * callback. Nothing in it is applied to the project automatically.
 */
export async function importResultTx(
  access: ProjectAccess,
  row: HandoffRow,
  raw: string,
): Promise<AgentResult> {
  const result = parseAgentResult(raw);
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    await tx
      .update(agentHandoffs)
      .set({ status: "result_imported", result: result as unknown as Record<string, unknown> })
      .where(eq(agentHandoffs.id, row.id));
    const [agent] = await tx
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, row.agentId));
    await batch.emit(tx, {
      type: "AGENT_RESULT_IMPORTED",
      projectId: access.project.id,
      actorId: access.actor.id,
      entityType: "handoff",
      entityId: row.id,
      data: {
        title: result.summary.slice(0, 120) || "result",
        agent: agent?.name ?? "",
        status: result.status,
      },
    });
    await recordAudit(tx, {
      actorId: access.actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "agent.result_imported",
      entityType: "handoff",
      entityId: row.id,
      metadata: { status: result.status, changes: result.changes.length },
    });
  });
  batch.flush();
  if (row.runId) await closeRun(access, row.runId, result.status !== "failed", result);
  return result;
}

export async function importResult(actor: Actor, slug: string, input: unknown) {
  const { handoffId, raw } = parse(
    z.object({ handoffId: z.uuid(), raw: z.string().min(1).max(60_000) }),
    input,
  );
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  const row = await getHandoff(access, handoffId);
  if (!row) throw new AppError("NOT_FOUND");
  if (row.status === "cancelled") throw new AppError("CONFLICT", "Cancelled");
  return importResultTx(access, row, raw);
}

/** Resolves the agent run waiting on this handoff. Imported in a lazy import to avoid a cycle. */
async function closeRun(
  access: ProjectAccess,
  runId: string,
  succeeded: boolean,
  result?: AgentResult,
) {
  const { finishExternalRun } = await import("./controls");
  await finishExternalRun(access, runId, succeeded, result ?? null);
}
