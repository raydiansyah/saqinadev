import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  agents,
  auditEvents,
  memories,
  memoryAcl,
  memoryAssets,
  memoryBindings,
  memoryJobs,
  memorySources,
  memoryVersions,
} from "@/lib/db/schema";
import { type AssetStatus, REVIEW_STATUSES } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { loadAsset, principalOf } from "./access";
import { canManage } from "./policy";
import { visibleWhere } from "./scope";

export type AssetRow = {
  asset: typeof memoryAssets.$inferSelect;
  memory: typeof memories.$inferSelect;
};

/** Assets of the project the requester may read, in the given statuses. Capped. */
export async function listAssets(
  access: ProjectAccess,
  statuses: readonly AssetStatus[] = ["approved"],
  limit = 200,
): Promise<AssetRow[]> {
  return db
    .select({ asset: memoryAssets, memory: memories })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(visibleWhere(principalOf(access), access.project.id, statuses))
    .orderBy(desc(memoryAssets.updatedAt))
    .limit(limit);
}

export interface ReviewItem extends AssetRow {
  conflict: { id: string; title: string; content: string } | null;
  sources: (typeof memorySources.$inferSelect)[];
}

/** What waits for a person: candidates and pending reviews the requester can see. */
export async function listReviewQueue(access: ProjectAccess): Promise<ReviewItem[]> {
  const rows = await listAssets(access, REVIEW_STATUSES, 100);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.asset.id);
  const sources = await db.select().from(memorySources).where(inArray(memorySources.assetId, ids));
  const conflictIds = rows.flatMap((r) => (r.asset.conflictWithId ? [r.asset.conflictWithId] : []));
  // A conflicting memory is shown only when the reviewer may read it.
  const visible = conflictIds.length
    ? await db
        .select({ id: memoryAssets.id, title: memoryAssets.title, content: memories.content })
        .from(memoryAssets)
        .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
        .where(
          and(
            visibleWhere(principalOf(access), access.project.id, ["approved"]),
            inArray(memoryAssets.id, conflictIds),
          ),
        )
    : [];
  const byId = new Map(visible.map((v) => [v.id, v]));
  return rows.map((r) => ({
    ...r,
    sources: sources.filter((s) => s.assetId === r.asset.id),
    conflict: r.asset.conflictWithId ? (byId.get(r.asset.conflictWithId) ?? null) : null,
  }));
}

export interface Overview {
  byStatus: Record<string, number>;
  byLevel: Record<string, number>;
  pendingReview: number;
  recent: AssetRow[];
  mostUsed: AssetRow[];
  jobs: { queued: number; failed: number };
  boundAgents: number;
  /** Pages the wiki has read from project documents. */
  wikiPages: number;
  /** Approved skills the viewer may use. */
  skills: number;
  /** Semantic search needs an embedding model; none is configured yet. */
  semantic: "off";
}

/** Counts only what the requester may read, so the numbers never reveal hidden assets. */
export async function getOverview(access: ProjectAccess): Promise<Overview> {
  const isAdmin = access.role === "owner" || access.role === "admin";
  const scope = visibleWhere(principalOf(access), access.project.id, [
    "candidate",
    "pending_review",
    "approved",
    "rejected",
    "superseded",
    "archived",
  ]);
  const [statusRows, levelRows, jobRows, bound, recent, mostUsed, wiki, skillCount, skillPending] =
    await Promise.all([
      db
        .select({ key: memoryAssets.status, n: count() })
        .from(memoryAssets)
        .where(and(scope, eq(memoryAssets.assetType, "chat")))
        .groupBy(memoryAssets.status),
      db
        .select({ key: memories.level, n: count() })
        .from(memoryAssets)
        .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
        .where(and(scope, eq(memoryAssets.status, "approved")))
        .groupBy(memories.level),
      db
        .select({ status: memoryJobs.status, n: count() })
        .from(memoryJobs)
        .where(eq(memoryJobs.projectId, access.project.id))
        .groupBy(memoryJobs.status),
      db
        .select({ n: sql<number>`count(distinct ${memoryBindings.targetId})` })
        .from(memoryBindings)
        .innerJoin(agents, sql`${agents.id}::text = ${memoryBindings.targetId}`)
        .where(
          and(eq(memoryBindings.projectId, access.project.id), eq(memoryBindings.enabled, true)),
        ),
      listAssets(access, ["approved"], 6),
      db
        .select({ asset: memoryAssets, memory: memories })
        .from(memoryAssets)
        .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
        .where(
          and(
            visibleWhere(principalOf(access), access.project.id),
            sql`${memoryAssets.useCount} > 0`,
          ),
        )
        .orderBy(desc(memoryAssets.useCount))
        .limit(5),
      db
        .select({ n: count() })
        .from(memoryAssets)
        .where(and(scope, eq(memoryAssets.assetType, "wiki"), eq(memoryAssets.status, "approved"))),
      db
        .select({ n: count() })
        .from(memoryAssets)
        .where(
          and(scope, eq(memoryAssets.assetType, "skill"), eq(memoryAssets.status, "approved")),
        ),
      db
        .select({ n: count() })
        .from(memoryAssets)
        .where(
          and(
            scope,
            eq(memoryAssets.assetType, "skill"),
            inArray(memoryAssets.status, [...REVIEW_STATUSES]),
          ),
        ),
    ]);
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.key, r.n]));
  const jobCount = (...s: string[]) =>
    jobRows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.n, 0);
  return {
    byStatus,
    byLevel: Object.fromEntries(levelRows.map((r) => [r.key, r.n])),
    pendingReview:
      (byStatus.candidate ?? 0) + (byStatus.pending_review ?? 0) + (skillPending[0]?.n ?? 0),
    recent,
    mostUsed,
    // Background work reveals other people's chats; only admins see it.
    jobs: isAdmin
      ? {
          queued: jobCount("queued", "processing", "failed_retryable"),
          failed: jobCount("failed_permanent"),
        }
      : { queued: 0, failed: 0 },
    boundAgents: Number(bound[0]?.n ?? 0),
    wikiPages: wiki[0]?.n ?? 0,
    skills: skillCount[0]?.n ?? 0,
    semantic: "off",
  };
}

export async function getAssetDetail(access: ProjectAccess, assetId: string) {
  const loaded = await loadAsset(db, access, assetId);
  const [versions, sources, bindings, history] = await Promise.all([
    db
      .select()
      .from(memoryVersions)
      .where(eq(memoryVersions.assetId, assetId))
      .orderBy(desc(memoryVersions.version))
      .limit(50),
    db.select().from(memorySources).where(eq(memorySources.assetId, assetId)),
    db
      .select()
      .from(memoryBindings)
      .where(
        and(eq(memoryBindings.assetId, assetId), eq(memoryBindings.projectId, access.project.id)),
      ),
    db
      .select({
        id: auditEvents.id,
        type: auditEvents.type,
        actorId: auditEvents.actorId,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, "memory_asset"),
          eq(auditEvents.entityId, assetId),
          eq(auditEvents.projectId, access.project.id),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(30),
  ]);
  const canManageIt = canManage(loaded.principal, loaded.asset, loaded.acl);
  // Who was granted access, and which agents carry it, is for the people who manage it.
  const acl = canManageIt ? loaded.acl : [];
  return {
    asset: loaded.asset,
    memory: loaded.memory,
    versions,
    sources,
    bindings: canManageIt ? bindings : [],
    history,
    acl,
    canManage: canManageIt,
  };
}

/** Jobs are operational detail: project admins only. */
export async function listJobs(access: ProjectAccess, limit = 50) {
  if (access.role !== "owner" && access.role !== "admin") throw new AppError("AUTHORIZATION_ERROR");
  return db
    .select({
      id: memoryJobs.id,
      kind: memoryJobs.kind,
      status: memoryJobs.status,
      attempts: memoryJobs.attempts,
      errorCode: memoryJobs.errorCode,
      createdAt: memoryJobs.createdAt,
      runAfter: memoryJobs.runAfter,
    })
    .from(memoryJobs)
    .where(eq(memoryJobs.projectId, access.project.id))
    .orderBy(desc(memoryJobs.createdAt))
    .limit(limit);
}

/** Agents of the project, for equipping them. Names only. */
export async function listProjectAgents(access: ProjectAccess) {
  return db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(eq(agents.projectId, access.project.id))
    .orderBy(agents.name)
    .limit(50);
}
