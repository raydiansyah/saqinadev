import "server-only";
import { and, eq, or } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { mcpConnections, tools } from "@/lib/db/schema";
import { STATIC_TOOLS, toolKey } from "./catalog";

export type ToolRow = typeof tools.$inferSelect;

/**
 * Built-in tools get a row per project on first use (lazy, idempotent). Existing rows keep
 * whatever trust or risk a project admin set.
 */
export async function ensureProjectTools(executor: Executor, projectId: string): Promise<void> {
  await executor
    .insert(tools)
    .values(
      STATIC_TOOLS.map((t) => ({
        projectId,
        source: t.source,
        connectionId: null,
        name: t.name,
        key: toolKey(t.source, null, t.name),
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
        riskLevel: t.riskLevel,
        trust: "enabled" as const,
        agentPermission: t.agentPermission,
        schemaHash: "static",
      })),
    )
    .onConflictDoNothing();

  // Tools of the platform's connectors: every project gets its own row, so its admin can still
  // switch one off for this project, and every run is audited against the project.
  const connectors = await executor
    .select({ id: mcpConnections.id, catalog: mcpConnections.toolCatalog })
    .from(mcpConnections)
    .where(
      and(
        eq(mcpConnections.scope, "platform"),
        eq(mcpConnections.enabled, true),
        eq(mcpConnections.status, "connected"),
      ),
    );
  const rows = connectors.flatMap((c) =>
    c.catalog.map((t) => ({
      projectId,
      source: "mcp" as const,
      connectionId: c.id,
      name: t.name,
      key: toolKey("mcp", c.id, t.name),
      description: t.description,
      inputSchema: t.inputSchema,
      riskLevel: t.riskLevel,
      trust: t.enabled ? ("enabled" as const) : ("discovered" as const),
      agentPermission: "use_mcp_tools" as const,
      schemaHash: t.schemaHash,
    })),
  );
  if (rows.length > 0) await executor.insert(tools).values(rows).onConflictDoNothing();
}

/** Finds a tool by key, or by bare name (built-in first, then enabled MCP tools). */
export async function findTool(projectId: string, ref: string): Promise<ToolRow | null> {
  await ensureProjectTools(db, projectId);
  const rows = await db
    .select()
    .from(tools)
    .where(
      and(
        eq(tools.projectId, projectId),
        ref.includes(":") ? eq(tools.key, ref) : or(eq(tools.name, ref), eq(tools.key, ref)),
      ),
    );
  if (rows.length <= 1) return rows[0] ?? null;
  return rows.find((t) => t.source !== "mcp") ?? rows.find((t) => t.trust === "enabled") ?? rows[0];
}
