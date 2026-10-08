import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { AGENT_CAPABILITIES, AGENT_PERMISSIONS, AGENT_STRATEGIES } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { assertSafeEndpoint } from "@/lib/net/endpoint-guard";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import { FORBIDDEN_PERMISSIONS } from "./capabilities";
import { AGENT_ADAPTERS } from "./external/adapters";

/** Connection settings for an external agent. Secrets go to the encrypted store only. */
const connectionInput = z.object({
  agentId: z.uuid(),
  strategy: z.enum(AGENT_STRATEGIES),
  endpoint: z.string().trim().max(300).nullish(),
  secret: z.string().trim().min(16).max(500).optional(),
});

export async function configureAgentConnection(actor: Actor, slug: string, input: unknown) {
  const data = parse(connectionInput, input);
  if (data.strategy === "webhook") {
    if (!data.endpoint)
      throw new AppError("VALIDATION_ERROR", "Endpoint required", { endpoint: "required" });
    await assertSafeEndpoint(data.endpoint);
  }
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [agent] = await tx
      .select()
      .from(agents)
      .where(and(eq(agents.id, data.agentId), eq(agents.projectId, access.project.id)));
    if (!agent || agent.type === "saqina") throw new AppError("NOT_FOUND");
    let credentialId = agent.credentialId;
    if (data.secret) {
      if (credentialId) await revokeCredential(tx, credentialId);
      credentialId = await storeCredential(tx, {
        scope: "project",
        kind: "agent",
        label: agent.name,
        secret: data.secret,
        projectId: access.project.id,
        createdBy: actor.id,
      });
    }
    if (data.strategy === "webhook" && !credentialId)
      throw new AppError("VALIDATION_ERROR", "Signing secret required", { secret: "required" });
    // Passive strategies are always usable: they export a package for the user to carry over.
    const passive = !AGENT_ADAPTERS[data.strategy].canDispatch;
    await tx
      .update(agents)
      .set({
        connectionStrategy: data.strategy,
        endpoint: data.strategy === "webhook" ? data.endpoint : null,
        credentialId,
        connectionStatus: passive ? "connected" : "untested",
      })
      .where(eq(agents.id, agent.id));
    if (passive)
      await batch.emit(tx, {
        type: "AGENT_CONNECTED",
        projectId: access.project.id,
        actorId: actor.id,
        entityType: "agent",
        entityId: agent.id,
        data: { title: agent.name, agent: agent.name, strategy: data.strategy },
      });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "agent.connection_configured",
      entityType: "agent",
      entityId: agent.id,
      metadata: { agent: agent.name, strategy: data.strategy, secret: Boolean(credentialId) },
    });
  });
  batch.flush();
}

/** Sends a signed ping. Only the result code is kept. */
export async function testAgentConnection(actor: Actor, slug: string, input: unknown) {
  const { agentId } = parse(z.object({ agentId: z.uuid() }), input);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, access.project.id)));
  if (!agent) throw new AppError("NOT_FOUND");
  const adapter = AGENT_ADAPTERS[agent.connectionStrategy];
  if (!adapter.test || !agent.endpoint || !agent.credentialId)
    return {
      ok: !adapter.canDispatch,
      code: adapter.canDispatch ? "not_configured" : "export_only",
    };
  const endpoint = agent.endpoint;
  const result = await withSecret(
    agent.credentialId,
    { kind: "agent", projectId: access.project.id },
    (secret) =>
      adapter.test?.(endpoint, secret) ?? Promise.resolve({ ok: false, code: "unsupported" }),
  );
  const status = result.ok ? "connected" : result.code === "auth_failed" ? "unauthorized" : "error";
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    await tx.update(agents).set({ connectionStatus: status }).where(eq(agents.id, agent.id));
    if (result.ok)
      await batch.emit(tx, {
        type: "AGENT_CONNECTED",
        projectId: access.project.id,
        actorId: actor.id,
        entityType: "agent",
        entityId: agent.id,
        data: { title: agent.name, agent: agent.name, strategy: agent.connectionStrategy },
      });
  });
  batch.flush();
  return result;
}

export async function disconnectAgent(actor: Actor, slug: string, input: unknown) {
  const { agentId } = parse(z.object({ agentId: z.uuid() }), input);
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [agent] = await tx
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, access.project.id)));
    if (!agent || agent.type === "saqina") throw new AppError("NOT_FOUND");
    if (agent.credentialId) await revokeCredential(tx, agent.credentialId);
    await tx
      .update(agents)
      .set({
        connectionStrategy: "handoff",
        endpoint: null,
        credentialId: null,
        connectionStatus: "disconnected",
      })
      .where(eq(agents.id, agent.id));
    await batch.emit(tx, {
      type: "AGENT_DISCONNECTED",
      projectId: access.project.id,
      actorId: actor.id,
      entityType: "agent",
      entityId: agent.id,
      data: { title: agent.name, agent: agent.name },
    });
  });
  batch.flush();
}

const customInput = z.object({
  name: z.string().trim().min(2).max(60),
  capabilities: z.array(z.enum(AGENT_CAPABILITIES)).min(1).max(AGENT_CAPABILITIES.length),
  permissions: z
    .array(z.enum(AGENT_PERMISSIONS))
    .max(AGENT_PERMISSIONS.length)
    .refine((p) => !p.some((x) => FORBIDDEN_PERMISSIONS.includes(x)), "forbidden"),
});

/** A project-specific agent. Connection details are set afterwards like any external agent. */
export async function createCustomAgent(actor: Actor, slug: string, input: unknown) {
  const data = parse(customInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [row] = await tx
      .insert(agents)
      .values({
        projectId: access.project.id,
        name: data.name,
        type: "custom",
        role: "general",
        provider: "Custom",
        capabilities: data.capabilities,
        permissions: data.permissions,
        connectionStrategy: "handoff",
        connectionStatus: "connected",
      })
      .onConflictDoNothing()
      .returning({ id: agents.id });
    if (!row) throw new AppError("CONFLICT", "Name taken", { name: "exists" });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "agent.created",
      entityType: "agent",
      entityId: row.id,
      metadata: { name: data.name },
    });
    return { id: row.id };
  });
}
