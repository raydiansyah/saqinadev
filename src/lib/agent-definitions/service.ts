import "server-only";
import { and, count, desc, eq, inArray, isNotNull, max, ne } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db, type Executor, type Tx } from "@/lib/db/client";
import {
  agentDefinitions,
  agentDefinitionVersions,
  agentRuns,
  agents,
  aiModels,
  users,
} from "@/lib/db/schema";
import type { AgentPermission } from "@/lib/domain/enums";
import { AGENT_DEFINITION_STATUSES, type AgentDefinitionStatus } from "@/lib/domain/executions";
import { AppError } from "@/lib/errors";
import { requirePlatformOwner } from "@/lib/platform/roles";
import { parse } from "@/lib/validation";
import {
  CONFIG_FIELDS,
  type CreateDefinitionInput,
  createDefinitionInput,
  type DefinitionConfig,
  definitionConfig,
} from "./input";
import { PRESETS } from "./presets";

export type AgentDefinitionRow = typeof agentDefinitions.$inferSelect;

/**
 * Owner-only registry of agent definitions. A definition is platform-wide: projects follow it,
 * they cannot change it. Each change is a new version with a full copy, and is audited by field
 * name (instruction text never goes into the audit trail).
 */

const idInput = z.uuid();

const configOf = (row: AgentDefinitionRow | DefinitionConfig): DefinitionConfig =>
  Object.fromEntries(CONFIG_FIELDS.map((f) => [f, row[f]])) as DefinitionConfig;

/** A full copy of a definition as it is saved: what an execution freezes and a version keeps. */
export const snapshotOf = (row: AgentDefinitionRow): Record<string, unknown> => ({
  id: row.id,
  key: row.key,
  status: row.status,
  version: row.version,
  ...configOf(row),
});

const changedFields = (before: DefinitionConfig, after: DefinitionConfig) =>
  CONFIG_FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));

async function checkReferences(
  tx: Executor,
  config: DefinitionConfig,
  ownKey: string,
): Promise<void> {
  const fields: Record<string, string> = {};
  if (config.handoffTargets.includes(ownKey)) fields.handoffTargets = "invalid";
  else if (config.handoffTargets.length > 0) {
    const found = await tx
      .select({ key: agentDefinitions.key })
      .from(agentDefinitions)
      .where(
        and(
          inArray(agentDefinitions.key, config.handoffTargets),
          ne(agentDefinitions.status, "archived"),
        ),
      );
    if (found.length !== new Set(config.handoffTargets).size) fields.handoffTargets = "unknown";
  }
  if (config.modelId) {
    const [model] = await tx
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(eq(aiModels.id, config.modelId));
    if (!model) fields.modelId = "unknown";
  }
  if (Object.keys(fields).length > 0)
    throw new AppError("VALIDATION_ERROR", "Invalid agent definition", fields);
}

async function saveVersion(
  tx: Tx,
  row: AgentDefinitionRow,
  changed: string[],
  actorId: string | null,
) {
  await tx.insert(agentDefinitionVersions).values({
    definitionId: row.id,
    version: row.version,
    snapshot: snapshotOf(row),
    changedFields: changed,
    changedBy: actorId,
  });
}

/** The nine starting definitions. Existing keys are left alone, so an archived preset stays archived. */
export async function ensurePresets(executor: Executor, actorId: string | null): Promise<void> {
  const rows = await executor
    .insert(agentDefinitions)
    .values(
      PRESETS.map((p) => ({
        ...p,
        modelId: null,
        skills: [],
        permissions: p.permissions as AgentPermission[],
        updatedBy: actorId,
      })),
    )
    .onConflictDoNothing()
    .returning();
  for (const row of rows) {
    await executor.insert(agentDefinitionVersions).values({
      definitionId: row.id,
      version: 1,
      snapshot: snapshotOf(row),
      changedFields: ["created"],
      changedBy: actorId,
    });
  }
  if (rows.length > 0)
    await recordAudit(executor, {
      actorId,
      scope: "platform",
      type: "agent_definition.seeded",
      entityType: "agent_definition",
      metadata: { count: rows.length },
    });
}

export async function listDefinitions(actor: Actor): Promise<AgentDefinitionRow[]> {
  await requirePlatformOwner(actor);
  await ensurePresets(db, actor.id);
  return db
    .select()
    .from(agentDefinitions)
    .orderBy(desc(agentDefinitions.priority), agentDefinitions.name);
}

export async function getDefinition(actor: Actor, id: string) {
  await requirePlatformOwner(actor);
  if (!idInput.safeParse(id).success) throw new AppError("NOT_FOUND");
  const [row] = await db.select().from(agentDefinitions).where(eq(agentDefinitions.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  const versions = await db
    .select({
      version: agentDefinitionVersions.version,
      changedFields: agentDefinitionVersions.changedFields,
      createdAt: agentDefinitionVersions.createdAt,
      changedBy: users.name,
    })
    .from(agentDefinitionVersions)
    .leftJoin(users, eq(users.id, agentDefinitionVersions.changedBy))
    .where(eq(agentDefinitionVersions.definitionId, id))
    .orderBy(desc(agentDefinitionVersions.version))
    .limit(30);
  return { definition: row, versions };
}

export async function createDefinition(actor: Actor, input: unknown): Promise<AgentDefinitionRow> {
  await requirePlatformOwner(actor);
  const data: CreateDefinitionInput = parse(createDefinitionInput, input);
  const { key, ...config } = data;
  return db.transaction(async (tx) => {
    const [taken] = await tx
      .select({ id: agentDefinitions.id })
      .from(agentDefinitions)
      .where(eq(agentDefinitions.key, key));
    if (taken) throw new AppError("CONFLICT", "Key in use", { key: "taken" });
    await checkReferences(tx, config, key);
    const [row] = await tx
      .insert(agentDefinitions)
      .values({
        ...config,
        key,
        permissions: config.permissions as AgentPermission[],
        updatedBy: actor.id,
      })
      .returning();
    await saveVersion(tx, row, ["created"], actor.id);
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "agent_definition.created",
      entityType: "agent_definition",
      entityId: row.id,
      metadata: { key, role: row.role, version: 1 },
    });
    return row;
  });
}

/** Saves the whole configuration. A change that alters nothing is not a new version. */
export async function updateDefinition(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<AgentDefinitionRow> {
  await requirePlatformOwner(actor);
  if (!idInput.safeParse(id).success) throw new AppError("NOT_FOUND");
  const config = parse(definitionConfig, input);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, id))
      .for("update");
    if (!current) throw new AppError("NOT_FOUND");
    const changed = changedFields(configOf(current), config);
    if (changed.length === 0) return current;
    await checkReferences(tx, config, current.key);
    const [row] = await tx
      .update(agentDefinitions)
      .set({
        ...config,
        permissions: config.permissions as AgentPermission[],
        version: current.version + 1,
        updatedBy: actor.id,
      })
      .where(eq(agentDefinitions.id, id))
      .returning();
    await saveVersion(tx, row, changed, actor.id);
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "agent_definition.updated",
      entityType: "agent_definition",
      entityId: id,
      metadata: { key: row.key, version: row.version, changed: changed.join(",") },
    });
    return row;
  });
}

export async function setDefinitionStatus(
  actor: Actor,
  id: string,
  status: unknown,
): Promise<AgentDefinitionRow> {
  await requirePlatformOwner(actor);
  if (!idInput.safeParse(id).success) throw new AppError("NOT_FOUND");
  const next = parse(z.enum(AGENT_DEFINITION_STATUSES), status) as AgentDefinitionStatus;
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, id))
      .for("update");
    if (!current) throw new AppError("NOT_FOUND");
    if (current.status === next) return current;
    const [row] = await tx
      .update(agentDefinitions)
      .set({ status: next, version: current.version + 1, updatedBy: actor.id })
      .where(eq(agentDefinitions.id, id))
      .returning();
    await saveVersion(tx, row, ["status"], actor.id);
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "agent_definition.status_changed",
      entityType: "agent_definition",
      entityId: id,
      metadata: { key: row.key, version: row.version, from: current.status, to: next },
    });
    return row;
  });
}

/** Definitions that can take new work. Internal: callers have already checked access to a project. */
export async function activeDefinitions(executor: Executor): Promise<AgentDefinitionRow[]> {
  return executor
    .select()
    .from(agentDefinitions)
    .where(eq(agentDefinitions.status, "active"))
    .orderBy(desc(agentDefinitions.priority), agentDefinitions.name);
}

export interface DefinitionUsage {
  runs: number;
  succeeded: number;
  failed: number;
  lastRunAt: Date | null;
}

/**
 * How each kind of agent has done across all projects, as numbers only. The Owner sees whether an
 * agent works; the messages, files and tasks of a client's project stay in that project.
 */
export async function definitionUsage(actor: Actor): Promise<Record<string, DefinitionUsage>> {
  await requirePlatformOwner(actor);
  const rows = await db
    .select({
      definitionId: agents.definitionId,
      status: agentRuns.status,
      n: count(),
      last: max(agentRuns.createdAt),
    })
    .from(agentRuns)
    .innerJoin(agents, eq(agents.id, agentRuns.agentId))
    .where(isNotNull(agents.definitionId))
    .groupBy(agents.definitionId, agentRuns.status);
  const out: Record<string, DefinitionUsage> = {};
  for (const r of rows) {
    if (!r.definitionId) continue;
    const u = (out[r.definitionId] ??= { runs: 0, succeeded: 0, failed: 0, lastRunAt: null });
    u.runs += r.n;
    if (r.status === "completed") u.succeeded += r.n;
    if (r.status === "failed") u.failed += r.n;
    if (r.last && (!u.lastRunAt || r.last > u.lastRunAt)) u.lastRunAt = r.last;
  }
  return out;
}
