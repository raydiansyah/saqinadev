import "server-only";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import * as z from "zod";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { memories, memoryAssets, memoryBindings, memorySources } from "@/lib/db/schema";
import { BINDING_MODES, BINDING_TARGETS, MEMORY_KINDS, MEMORY_LEVELS } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { loadAnyAsset } from "./access";
import type { Principal } from "./policy";
import { applyBudget, type Budget, resolveBudget } from "./retrieval/budget";
import type { RetrievedItem } from "./retrieval/engine";
import { notExpired, visibleWhere } from "./scope";

export type BindingView = typeof memoryBindings.$inferSelect;

export const bindingInput = z
  .object({
    targetType: z.enum(BINDING_TARGETS),
    targetId: z.string().trim().min(1).max(64),
    assetId: z.uuid().optional(),
    selector: z
      .object({
        kind: z.enum(MEMORY_KINDS).optional(),
        level: z.enum(MEMORY_LEVELS).optional(),
        category: z.string().max(40).optional(),
      })
      .optional(),
    priority: z.number().int().min(0).max(100).default(0),
    mode: z.enum(BINDING_MODES).default("always"),
    taskTypes: z.array(z.string().max(40)).max(10).optional(),
  })
  .refine((v) => Boolean(v.assetId) !== Boolean(v.selector), {
    message: "asset_or_selector",
  });

export async function listBindings(access: ProjectAccess): Promise<BindingView[]> {
  return db
    .select()
    .from(memoryBindings)
    .where(eq(memoryBindings.projectId, access.project.id))
    .orderBy(desc(memoryBindings.priority), desc(memoryBindings.createdAt))
    .limit(200);
}

export async function createBinding(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<BindingView> {
  const data = parse(bindingInput, input);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "members:manage", tx);
    if (data.assetId) {
      // Bound to an asset the creator can read: an unreadable id is as unknown as a missing one.
      await loadAnyAsset(tx, access, data.assetId);
    }
    const [row] = await tx
      .insert(memoryBindings)
      .values({
        projectId: access.project.id,
        targetType: data.targetType,
        targetId: data.targetId,
        assetId: data.assetId ?? null,
        selector: data.selector ?? null,
        priority: data.priority,
        mode: data.mode,
        taskTypes: data.taskTypes ?? null,
        createdBy: actor.id,
      })
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "memory.binding_created",
      entityType: "memory_binding",
      entityId: row.id,
      metadata: { targetType: data.targetType },
    });
    return row;
  });
}

export async function revokeBinding(actor: Actor, slug: string, input: unknown): Promise<void> {
  const { id } = parse(z.object({ id: z.uuid() }), input);
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "members:manage", tx);
    const gone = await tx
      .delete(memoryBindings)
      .where(and(eq(memoryBindings.id, id), eq(memoryBindings.projectId, access.project.id)))
      .returning({ id: memoryBindings.id });
    if (gone.length === 0) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "memory.binding_revoked",
      entityType: "memory_binding",
      entityId: id,
    });
  });
}

export interface Loadout {
  items: RetrievedItem[];
  /** Bindings that selected something the requester can no longer read are simply skipped. */
  skipped: number;
}

/**
 * What an agent (or role, or the assistant) is equipped with. A binding only *selects*: every
 * selected asset is read again through `visibleWhere`, so a revoked permission or a deleted asset
 * drops out here even though the binding still exists.
 */
export async function resolveLoadout(
  principal: Principal,
  projectId: string,
  target: { type: "agent" | "agent_role" | "assistant"; id: string },
  options: { taskType?: string; budget?: Partial<Budget> } = {},
): Promise<Loadout> {
  const bindings = await db
    .select()
    .from(memoryBindings)
    .where(
      and(
        eq(memoryBindings.projectId, projectId),
        eq(memoryBindings.targetType, target.type),
        eq(memoryBindings.targetId, target.id),
        eq(memoryBindings.enabled, true),
        eq(memoryBindings.mode, "always"),
        options.taskType
          ? or(
              isNull(memoryBindings.taskTypes),
              sql`${options.taskType} = any(${memoryBindings.taskTypes})`,
            )
          : isNull(memoryBindings.taskTypes),
      ),
    )
    .orderBy(desc(memoryBindings.priority))
    .limit(50);
  if (bindings.length === 0) return { items: [], skipped: 0 };

  const scope = and(visibleWhere(principal, projectId, ["approved"]), notExpired());
  const condition = (b: BindingView) =>
    and(
      b.assetId ? eq(memoryAssets.id, b.assetId) : undefined,
      b.selector?.kind ? eq(memories.kind, b.selector.kind) : undefined,
      b.selector?.level ? eq(memories.level, b.selector.level) : undefined,
      b.selector?.category ? eq(memories.category, b.selector.category as never) : undefined,
    ) ?? sql`true`;

  // One query for every binding, matched in memory: the number of bindings costs no extra reads.
  const rows = await db
    .select({ asset: memoryAssets, memory: memories })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(and(scope, or(...bindings.map(condition))))
    .limit(300);
  const matches = (b: BindingView, r: (typeof rows)[number]) =>
    (!b.assetId || b.assetId === r.asset.id) &&
    (!b.selector?.kind || b.selector.kind === r.memory.kind) &&
    (!b.selector?.level || b.selector.level === r.memory.level) &&
    (!b.selector?.category || b.selector.category === r.memory.category);

  const priorityOf = new Map<string, number>();
  let skipped = 0;
  for (const b of bindings) {
    const hit = rows.filter((r) => matches(b, r)).slice(0, 20);
    if (hit.length === 0) skipped++;
    for (const r of hit) {
      priorityOf.set(r.asset.id, Math.max(priorityOf.get(r.asset.id) ?? 0, b.priority));
    }
  }
  const ids = [...priorityOf.keys()];
  if (ids.length === 0) return { items: [], skipped };
  const sources = await db.select().from(memorySources).where(inArray(memorySources.assetId, ids));

  const ordered = rows
    .filter((r) => priorityOf.has(r.asset.id))
    .map((r) => ({ r, priority: priorityOf.get(r.asset.id) ?? 0 }))
    .sort(
      (a, b) =>
        b.priority - a.priority || b.r.asset.updatedAt.getTime() - a.r.asset.updatedAt.getTime(),
    );
  const fitted = applyBudget(
    ordered.map((o) => ({ ...o, content: o.r.memory.content })),
    resolveBudget(options.budget),
  );
  return {
    skipped,
    items: fitted.map((f) => ({
      assetId: f.r.asset.id,
      memoryId: f.r.memory.id,
      level: f.r.memory.level,
      kind: f.r.memory.kind,
      title: f.r.asset.title,
      content: f.content,
      truncated: f.truncated,
      confidence: f.r.memory.confidence,
      origin: f.r.memory.source,
      score: f.priority,
      updatedAt: f.r.asset.updatedAt,
      sources: sources
        .filter((s) => s.assetId === f.r.asset.id)
        .map((s) => ({ sourceType: s.sourceType, sourceId: s.sourceId, locator: s.locator })),
    })),
  };
}
