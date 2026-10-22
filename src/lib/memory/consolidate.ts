import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { memories, memoryAssets, memoryJobs, memorySources } from "@/lib/db/schema";
import type { MemoryCategory } from "@/lib/domain/enums";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import { insertChatMemory } from "./store";

type Job = typeof memoryJobs.$inferSelect;

/** Level-2 summaries need this many new approved facts of one kind. */
export const CONSOLIDATE_AFTER = 5;
export const CATEGORY_FOR: Record<MemoryKind, MemoryCategory> = {
  fact: "product",
  decision: "decision",
  preference: "user_preference",
  constraint: "constraint",
  issue: "technical",
  workaround: "technical",
  question: "product",
  milestone: "business",
};

/**
 * Level-2 summary: when enough approved facts of one kind have piled up uncited, propose one
 * scenario page that lists them. Deterministic (no model), cites each fact, and waits for review.
 */
export async function runConsolidation(job: Job): Promise<void> {
  const kind = String(job.input.kind) as MemoryKind;
  if (!MEMORY_KINDS.includes(kind)) throw new AppError("VALIDATION_ERROR");
  await db.transaction(async (tx) => {
    // Two runs for the same project and kind take turns, and the second finds the facts cited.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`consolidate:${job.projectId}:${kind}`}))`,
    );
    const facts = await uncitedFacts(tx, job.projectId, kind);
    if (facts.length < CONSOLIDATE_AFTER) return;
    const content = facts
      .map((f) => `- ${f.title}`)
      .join("\n")
      .slice(0, 4000);
    await insertChatMemory(tx, {
      projectId: job.projectId,
      title: `Summary: ${kind} (${facts.length})`,
      content,
      category: CATEGORY_FOR[kind],
      source: "system",
      createdBy: null,
      ownerId: facts[0].ownerId,
      visibility: "project",
      status: "pending_review",
      kind,
      level: "L2",
      confidence: "derived",
      sources: facts.map((f) => ({ sourceType: "memory" as const, sourceId: f.assetId })),
    });
  });
}

/** Approved, project-visible L1 facts of one kind that no level-2 summary cites yet. */
export async function uncitedFacts(executor: Executor, projectId: string, kind: MemoryKind) {
  const cited = db
    .select({ id: memorySources.sourceId })
    .from(memorySources)
    .innerJoin(memoryAssets, eq(memoryAssets.id, memorySources.assetId))
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(
      and(
        eq(memorySources.sourceType, "memory"),
        eq(memories.level, "L2"),
        eq(memoryAssets.projectId, projectId),
        // A summary a person rejected no longer counts as covering its facts.
        ne(memoryAssets.status, "rejected"),
      ),
    );
  return executor
    .select({ assetId: memoryAssets.id, title: memoryAssets.title, ownerId: memoryAssets.ownerId })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(
      and(
        eq(memoryAssets.projectId, projectId),
        eq(memoryAssets.status, "approved"),
        eq(memoryAssets.visibility, "project"),
        eq(memories.level, "L1"),
        eq(memories.kind, kind),
        sql`${memoryAssets.id}::text not in (${cited})`,
      ),
    )
    .orderBy(asc(memoryAssets.createdAt))
    .limit(30);
}
