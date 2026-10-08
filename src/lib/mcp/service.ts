import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { mcpConnections, tools } from "@/lib/db/schema";
import {
  MCP_AUTH_TYPES,
  MCP_SERVER_TYPES,
  TOOL_RISKS,
  TOOL_TRUST,
  type ToolRisk,
} from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { assertSafeEndpoint } from "@/lib/net/endpoint-guard";
import { revokeCredential, storeCredential, withSecret } from "@/lib/secrets/service";
import { toolKey } from "@/lib/tools/catalog";
import { parse } from "@/lib/validation";
import { McpClient, McpError, type McpTool } from "./client";

export type McpConnectionRow = typeof mcpConnections.$inferSelect;

export interface McpConnectionView {
  id: string;
  name: string;
  serverType: McpConnectionRow["serverType"];
  endpoint: string;
  authType: McpConnectionRow["authType"];
  hasCredential: boolean;
  status: McpConnectionRow["status"];
  lastError: string | null;
  serverInfo: Record<string, string>;
  lastConnectedAt: Date | null;
}

const view = (r: McpConnectionRow): McpConnectionView => ({
  id: r.id,
  name: r.name,
  serverType: r.serverType,
  endpoint: r.endpoint,
  authType: r.authType,
  hasCredential: Boolean(r.credentialId),
  status: r.status,
  lastError: r.lastError,
  serverInfo: r.serverInfo,
  lastConnectedAt: r.lastConnectedAt,
});

export async function listMcpConnections(access: ProjectAccess): Promise<McpConnectionView[]> {
  const rows = await db
    .select()
    .from(mcpConnections)
    .where(eq(mcpConnections.projectId, access.project.id))
    .orderBy(mcpConnections.name);
  return rows.map(view);
}

const createInput = z.object({
  name: z.string().trim().min(2).max(60),
  serverType: z.enum(MCP_SERVER_TYPES),
  endpoint: z.string().trim().min(8).max(300),
  authType: z.enum(MCP_AUTH_TYPES).default("none"),
  authHeader: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,60}$/)
    .nullish(),
  secret: z.string().trim().max(1000).optional(),
});

async function checkEndpoint(serverType: string, endpoint: string) {
  const url = await assertSafeEndpoint(endpoint);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (serverType === "local_dev" && !local)
    throw new AppError("VALIDATION_ERROR", "local_dev must be localhost", { endpoint: "notLocal" });
}

export async function createMcpConnection(actor: Actor, slug: string, input: unknown) {
  const data = parse(createInput, input);
  await checkEndpoint(data.serverType, data.endpoint);
  if (data.authType !== "none" && !data.secret)
    throw new AppError("VALIDATION_ERROR", "Secret required", { secret: "required" });
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const credentialId =
      data.authType !== "none" && data.secret
        ? await storeCredential(tx, {
            scope: "project",
            kind: "mcp",
            label: data.name,
            secret: data.secret,
            projectId: access.project.id,
            createdBy: actor.id,
          })
        : null;
    const [row] = await tx
      .insert(mcpConnections)
      .values({
        projectId: access.project.id,
        name: data.name,
        serverType: data.serverType,
        endpoint: data.endpoint,
        authType: data.authType,
        authHeader: data.authType === "header" ? (data.authHeader ?? "x-api-key") : null,
        credentialId,
        createdBy: actor.id,
      })
      .onConflictDoNothing()
      .returning({ id: mcpConnections.id });
    if (!row) throw new AppError("CONFLICT", "Name taken", { name: "exists" });
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "mcp.created",
      entityType: "mcp_connection",
      entityId: row.id,
      metadata: { name: data.name, serverType: data.serverType },
    });
    return { id: row.id };
  });
}

/** Opens a client with the connection's auth. The secret stays inside this call. */
export async function withMcpClient<T>(
  row: McpConnectionRow,
  use: (client: McpClient) => Promise<T>,
): Promise<T> {
  const run = async (headers: Record<string, string>) => {
    const client = new McpClient(row.endpoint, headers);
    try {
      await client.initialize();
      return await use(client);
    } finally {
      await client.close();
    }
  };
  if (row.authType === "none" || !row.credentialId) return run({});
  return withSecret(row.credentialId, { kind: "mcp", projectId: row.projectId }, (secret) =>
    run(
      row.authType === "bearer"
        ? { authorization: `Bearer ${secret}` }
        : { [row.authHeader ?? "x-api-key"]: secret },
    ),
  );
}

/** Risk from the server's own hints; the Owner or project admin can change it. */
export function riskFromAnnotations(tool: McpTool): ToolRisk {
  if (tool.annotations?.destructiveHint) return "high";
  if (tool.annotations?.readOnlyHint) return "low";
  return "medium";
}

const hashOf = (tool: McpTool) =>
  createHash("sha256")
    .update(JSON.stringify([tool.description ?? "", tool.inputSchema ?? {}]))
    .digest("hex")
    .slice(0, 16);

/**
 * Connects, discovers tools and normalises them. New tools start `discovered` and do nothing
 * until someone enables them; a tool whose schema changed goes back to `discovered`.
 */
export async function connectMcp(actor: Actor, slug: string, input: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }), input);
  const access = await loadProjectAccess(actor, { slug }, "project:update");
  const [row] = await db
    .select()
    .from(mcpConnections)
    .where(and(eq(mcpConnections.id, id), eq(mcpConnections.projectId, access.project.id)));
  if (!row) throw new AppError("NOT_FOUND");

  let discovered: McpTool[];
  let serverInfo: Record<string, string> = {};
  try {
    discovered = await withMcpClient(row, async (client) => {
      const list = await client.listTools();
      serverInfo = Object.fromEntries(
        Object.entries(client.serverInfo).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>;
      return list;
    });
  } catch (error) {
    const code = error instanceof McpError ? error.code : "network";
    await db
      .update(mcpConnections)
      .set({ status: code === "auth_failed" ? "unauthorized" : "error", lastError: code })
      .where(eq(mcpConnections.id, row.id));
    return { ok: false as const, code, tools: 0 };
  }

  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(tools).where(eq(tools.connectionId, row.id));
    for (const tool of discovered.slice(0, 200)) {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(tool.name)) continue;
      const hash = hashOf(tool);
      const prior = existing.find((t) => t.name === tool.name);
      const values = {
        projectId: access.project.id,
        source: "mcp" as const,
        connectionId: row.id,
        name: tool.name,
        key: toolKey("mcp", row.id, tool.name),
        description: (tool.description ?? "").slice(0, 1000),
        inputSchema: tool.inputSchema ?? {},
        outputSchema: tool.outputSchema ?? null,
        riskLevel: prior?.riskLevel ?? riskFromAnnotations(tool),
        trust: prior && prior.schemaHash === hash ? prior.trust : ("discovered" as const),
        agentPermission: "use_mcp_tools" as const,
        schemaHash: hash,
      };
      await tx
        .insert(tools)
        .values(values)
        .onConflictDoUpdate({ target: [tools.projectId, tools.key], set: values });
    }
    // Tools the server no longer offers are switched off, not deleted (audit rows point here).
    for (const t of existing)
      if (!discovered.some((d) => d.name === t.name))
        await tx.update(tools).set({ trust: "disabled" }).where(eq(tools.id, t.id));
    await tx
      .update(mcpConnections)
      .set({ status: "connected", lastError: null, serverInfo, lastConnectedAt: new Date() })
      .where(eq(mcpConnections.id, row.id));
    await batch.emit(tx, {
      type: "MCP_CONNECTED",
      projectId: access.project.id,
      actorId: actor.id,
      entityType: "mcp_connection",
      entityId: row.id,
      data: { title: row.name, tools: discovered.length },
    });
  });
  batch.flush();
  return { ok: true as const, code: "ok", tools: discovered.length };
}

export async function disconnectMcp(actor: Actor, slug: string, input: unknown) {
  const { id, remove } = parse(
    z.object({ id: z.uuid(), remove: z.boolean().default(false) }),
    input,
  );
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [row] = await tx
      .select()
      .from(mcpConnections)
      .where(and(eq(mcpConnections.id, id), eq(mcpConnections.projectId, access.project.id)));
    if (!row) throw new AppError("NOT_FOUND");
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx.update(tools).set({ trust: "disabled" }).where(eq(tools.connectionId, row.id));
    if (remove) await tx.delete(mcpConnections).where(eq(mcpConnections.id, row.id));
    else
      await tx
        .update(mcpConnections)
        .set({ status: "disconnected", credentialId: null })
        .where(eq(mcpConnections.id, row.id));
    await batch.emit(tx, {
      type: "MCP_DISCONNECTED",
      projectId: access.project.id,
      actorId: actor.id,
      entityType: "mcp_connection",
      entityId: row.id,
      data: { title: row.name },
    });
  });
  batch.flush();
}

const trustInput = z.object({
  toolId: z.uuid(),
  trust: z.enum(TOOL_TRUST).optional(),
  riskLevel: z.enum(TOOL_RISKS).optional(),
});

/** Enable/disable a tool or adjust its risk. Critical tools can be set but never run here. */
export async function setToolTrust(actor: Actor, slug: string, input: unknown) {
  const data = parse(trustInput, input);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const [row] = await tx
      .update(tools)
      .set({
        ...(data.trust ? { trust: data.trust } : {}),
        ...(data.riskLevel ? { riskLevel: data.riskLevel } : {}),
      })
      .where(and(eq(tools.id, data.toolId), eq(tools.projectId, access.project.id)))
      .returning({ name: tools.name, trust: tools.trust, riskLevel: tools.riskLevel });
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "tool.trust_changed",
      entityType: "tool",
      entityId: data.toolId,
      metadata: { name: row.name, trust: row.trust, risk: row.riskLevel },
    });
  });
}

export async function listProjectTools(access: ProjectAccess) {
  return db
    .select({
      id: tools.id,
      name: tools.name,
      source: tools.source,
      connectionId: tools.connectionId,
      description: tools.description,
      riskLevel: tools.riskLevel,
      trust: tools.trust,
      agentPermission: tools.agentPermission,
    })
    .from(tools)
    .where(eq(tools.projectId, access.project.id))
    .orderBy(tools.source, desc(tools.trust), tools.name);
}
