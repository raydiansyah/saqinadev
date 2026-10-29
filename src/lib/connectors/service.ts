import "server-only";
import { and, eq, sql } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { type McpToolCatalogEntry, mcpConnections, tools } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { McpError, type McpTool } from "@/lib/mcp/client";
import { checkEndpoint, hashOf, riskFromAnnotations, withMcpClient } from "@/lib/mcp/service";
import { requirePlatformOwner } from "@/lib/platform/roles";
import { revokeCredential, storeCredential } from "@/lib/secrets/service";
import { parse } from "@/lib/validation";
import { CONNECTOR_PRESET_IDS, presetById } from "./presets";

/**
 * Connectors the platform owner adds once (Settings > AI > Connectors): an MCP server whose tools
 * every project can use. Keys go to the encrypted store and are never returned. Each project still
 * runs a tool through the same policy, audit and approval as its own tools.
 */

export interface ConnectorView {
  id: string;
  name: string;
  preset: string | null;
  endpoint: string;
  authType: "none" | "bearer" | "header" | "url_key";
  hasCredential: boolean;
  enabled: boolean;
  status: string;
  lastError: string | null;
  lastConnectedAt: Date | null;
  tools: { name: string; description: string; riskLevel: string; enabled: boolean }[];
}

type Row = typeof mcpConnections.$inferSelect;

const view = (r: Row): ConnectorView => ({
  id: r.id,
  name: r.name,
  preset: r.preset,
  endpoint: r.endpoint,
  authType: r.authType,
  hasCredential: Boolean(r.credentialId),
  enabled: r.enabled,
  status: r.status,
  lastError: r.lastError,
  lastConnectedAt: r.lastConnectedAt,
  tools: r.toolCatalog.map((t) => ({
    name: t.name,
    description: t.description,
    riskLevel: t.riskLevel,
    enabled: t.enabled,
  })),
});

export async function listConnectors(actor: Actor): Promise<ConnectorView[]> {
  await requirePlatformOwner(actor);
  const rows = await db
    .select()
    .from(mcpConnections)
    .where(eq(mcpConnections.scope, "platform"))
    .orderBy(mcpConnections.name);
  return rows.map(view);
}

const secretField = z.string().trim().max(1000).optional();
const presetInput = z.object({ preset: z.enum(CONNECTOR_PRESET_IDS), secret: secretField });
const customInput = z.object({
  name: z.string().trim().min(2).max(60),
  endpoint: z.string().trim().min(8).max(300),
  authType: z.enum(["none", "bearer", "header", "url_key"]).default("none"),
  authHeader: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,60}$/)
    .nullish(),
  secret: secretField,
});

async function insertConnector(
  actor: Actor,
  data: {
    name: string;
    preset: string | null;
    endpoint: string;
    authType: ConnectorView["authType"];
    authHeader: string | null;
    secret?: string;
  },
) {
  await checkEndpoint("remote", data.endpoint, data.authType);
  if (data.authType !== "none" && !data.secret)
    throw new AppError("VALIDATION_ERROR", "Secret required", { secret: "required" });
  return db.transaction(async (tx) => {
    const credentialId =
      data.authType !== "none" && data.secret
        ? await storeCredential(tx, {
            scope: "platform",
            kind: "mcp",
            label: data.name,
            secret: data.secret,
            createdBy: actor.id,
          })
        : null;
    const [row] = await tx
      .insert(mcpConnections)
      .values({
        projectId: null,
        scope: "platform",
        preset: data.preset,
        name: data.name,
        serverType: "remote",
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
      scope: "platform",
      type: "connector.created",
      entityType: "mcp_connection",
      entityId: row.id,
      metadata: { name: data.name, preset: data.preset, credential: Boolean(credentialId) },
    });
    return { id: row.id };
  });
}

export async function addPresetConnector(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { preset, secret } = parse(presetInput, input);
  const p = presetById(preset);
  if (!p) throw new AppError("NOT_FOUND");
  if (p.keyRequired && !secret)
    throw new AppError("VALIDATION_ERROR", "Key required", { secret: "required" });
  return insertConnector(actor, {
    name: p.name,
    preset: p.id,
    endpoint: p.endpoint,
    authType: secret ? "bearer" : "none",
    authHeader: null,
    secret,
  });
}

export async function addCustomConnector(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const data = parse(customInput, input);
  return insertConnector(actor, { ...data, preset: null, authHeader: data.authHeader ?? null });
}

async function platformRow(id: string): Promise<Row> {
  const [row] = await db
    .select()
    .from(mcpConnections)
    .where(and(eq(mcpConnections.id, id), eq(mcpConnections.scope, "platform")));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

const catalogEntry = (tool: McpTool, prior?: McpToolCatalogEntry): McpToolCatalogEntry => {
  const schemaHash = hashOf(tool);
  const riskLevel = prior?.riskLevel ?? riskFromAnnotations(tool);
  return {
    name: tool.name,
    description: (tool.description ?? "").slice(0, 1000),
    inputSchema: tool.inputSchema ?? {},
    riskLevel,
    schemaHash,
    // A tool the owner already judged keeps that choice until its schema changes; a new one
    // starts on only when it says it changes nothing.
    enabled:
      prior && prior.schemaHash === schemaHash
        ? prior.enabled
        : Boolean(tool.annotations?.readOnlyHint) && !tool.annotations?.destructiveHint,
  };
};

/** Connects, reads the tool list, and refreshes the tools every project already holds. */
export async function connectConnector(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id } = parse(z.object({ id: z.uuid() }), input);
  const row = await platformRow(id);
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
  const catalog = discovered
    .filter((t) => /^[A-Za-z0-9_.-]{1,64}$/.test(t.name))
    .slice(0, 200)
    .map((t) =>
      catalogEntry(
        t,
        row.toolCatalog.find((p) => p.name === t.name),
      ),
    );
  await db.transaction(async (tx) => {
    await tx
      .update(mcpConnections)
      .set({
        status: "connected",
        lastError: null,
        serverInfo,
        toolCatalog: catalog,
        lastConnectedAt: new Date(),
      })
      .where(eq(mcpConnections.id, row.id));
    await syncConnectorTools(tx, row.id, catalog);
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "connector.connected",
      entityType: "mcp_connection",
      entityId: row.id,
      metadata: { name: row.name, tools: catalog.length },
    });
  });
  return { ok: true as const, code: "ok", tools: catalog.length };
}

/**
 * Brings every project's copy of a connector's tools in line with the catalog, one statement per
 * tool across all projects (never per project). Projects that have no copy yet get one from
 * `ensureProjectTools` on first use. Tools gone from the server are switched off, not deleted.
 */
async function syncConnectorTools(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  connectionId: string,
  catalog: McpToolCatalogEntry[],
) {
  for (const t of catalog) {
    await tx
      .update(tools)
      .set({
        description: t.description,
        inputSchema: t.inputSchema,
        riskLevel: t.riskLevel,
        schemaHash: t.schemaHash,
        trust: t.enabled ? "enabled" : "discovered",
      })
      .where(
        and(
          eq(tools.connectionId, connectionId),
          eq(tools.name, t.name),
          // Unchanged tools keep whatever a project admin set; a changed one is judged again.
          sql`${tools.schemaHash} <> ${t.schemaHash}`,
        ),
      );
  }
  const names = catalog.map((t) => t.name);
  await tx
    .update(tools)
    .set({ trust: "disabled" })
    .where(
      and(
        eq(tools.connectionId, connectionId),
        names.length
          ? sql`${tools.name} not in (${sql.join(
              names.map((n) => sql`${n}`),
              sql`, `,
            )})`
          : sql`true`,
      ),
    );
}

const enableInput = z.object({ id: z.uuid(), enabled: z.boolean() });

/** Switches a connector off for every project at once (its tools stop answering). */
export async function setConnectorEnabled(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id, enabled } = parse(enableInput, input);
  const row = await platformRow(id);
  await db.transaction(async (tx) => {
    await tx.update(mcpConnections).set({ enabled }).where(eq(mcpConnections.id, row.id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "connector.enabled",
      entityType: "mcp_connection",
      entityId: row.id,
      metadata: { name: row.name, enabled },
    });
  });
}

const toolInput = z.object({ id: z.uuid(), tool: z.string().min(1).max(64), enabled: z.boolean() });

/** The owner's call on one tool, for every project. */
export async function setConnectorTool(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id, tool, enabled } = parse(toolInput, input);
  const row = await platformRow(id);
  if (!row.toolCatalog.some((t) => t.name === tool)) throw new AppError("NOT_FOUND");
  const catalog = row.toolCatalog.map((t) => (t.name === tool ? { ...t, enabled } : t));
  await db.transaction(async (tx) => {
    await tx
      .update(mcpConnections)
      .set({ toolCatalog: catalog })
      .where(eq(mcpConnections.id, row.id));
    await tx
      .update(tools)
      .set({ trust: enabled ? "enabled" : "disabled" })
      .where(and(eq(tools.connectionId, row.id), eq(tools.name, tool)));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "connector.tool_changed",
      entityType: "mcp_connection",
      entityId: row.id,
      metadata: { name: row.name, tool, enabled },
    });
  });
}

/** Removes the connector, its key and every project's copy of its tools. */
export async function removeConnector(actor: Actor, input: unknown) {
  await requirePlatformOwner(actor);
  const { id } = parse(z.object({ id: z.uuid() }), input);
  const row = await platformRow(id);
  await db.transaction(async (tx) => {
    if (row.credentialId) await revokeCredential(tx, row.credentialId);
    await tx.delete(mcpConnections).where(eq(mcpConnections.id, row.id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "connector.removed",
      entityType: "mcp_connection",
      entityId: row.id,
      metadata: { name: row.name },
    });
  });
}
