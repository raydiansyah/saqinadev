import "server-only";
import { and, desc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memories, memoryAssets, memoryRetrievals, memorySources } from "@/lib/db/schema";
import type { MemorySource } from "@/lib/domain/enums";
import {
  type AssetType,
  type MemoryConfidence,
  type MemoryKind,
  type MemoryLevel,
  type SourceType,
} from "@/lib/domain/memory";
import { log } from "@/lib/log";
import { queryHash } from "../hash";
import type { Principal } from "../policy";
import { notExpired, visibleWhere } from "../scope";
import { applyBudget, type Budget, resolveBudget } from "./budget";
import { tsQuery } from "./fts";
import { exactTokens, rankCandidates, rrf } from "./rank";

export interface RetrieveOptions {
  /** What the requester is asking about. Empty means "what do we know about this project". */
  query?: string;
  levels?: readonly MemoryLevel[];
  assetTypes?: readonly AssetType[];
  budget?: Partial<Budget>;
}

export interface RetrievedSource {
  sourceType: SourceType;
  sourceId: string;
  locator: Record<string, string | number> | null;
}

export interface RetrievedItem {
  assetId: string;
  memoryId: string;
  level: MemoryLevel;
  kind: MemoryKind;
  title: string;
  content: string;
  truncated: boolean;
  confidence: MemoryConfidence;
  /** Who wrote it: a person, the assistant, an agent, the journal or an import. */
  origin: MemorySource;
  score: number;
  updatedAt: Date;
  sources: RetrievedSource[];
}

export interface RetrievalResult {
  items: RetrievedItem[];
  /** Semantic search is not available yet; results are lexical (full-text and exact match). */
  semantic: "off";
  /** Set when memory could not be read. The caller must say so instead of guessing. */
  degraded?: "unavailable" | "timeout";
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The single way to read memory for a question. Order matters and is part of the contract:
 * scope and access first (inside the SQL), then retrieval, fusion, a second access check on the
 * rows that are about to be returned, the context budget, and only then telemetry.
 * It never throws and never falls back to another project: on failure the result is empty and
 * marked `degraded`.
 */
export async function retrieveMemory(
  principal: Principal,
  projectId: string,
  options: RetrieveOptions = {},
): Promise<RetrievalResult> {
  const budget = resolveBudget(options.budget);
  const query = (options.query ?? "").trim().slice(0, 500);
  const started = Date.now();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budget.timeoutMs);
  });

  try {
    const outcome = await Promise.race([
      run(principal, projectId, query, options, budget),
      timeout,
    ]);
    if (outcome === "timeout") {
      log.warn("memory.retrieval.timeout", { projectId, ms: budget.timeoutMs });
      return { items: [], semantic: "off", degraded: "timeout" };
    }
    await recordTelemetry(principal, projectId, query, outcome, Date.now() - started);
    return { items: outcome, semantic: "off" };
  } catch (error) {
    // Not the error itself: a database error message can quote the query.
    log.error("memory.retrieval.failed", {
      projectId,
      error: error instanceof Error ? error.name : "error",
    });
    return { items: [], semantic: "off", degraded: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

async function run(
  principal: Principal,
  projectId: string,
  query: string,
  options: RetrieveOptions,
  budget: Budget,
): Promise<RetrievedItem[]> {
  // Chat memory only: wiki pages are read by passage through `retrieveWiki`, not by this function.
  const types = [...(options.assetTypes ?? ["chat"])].filter((t) => t === "chat");
  if (types.length === 0) return [];

  const levels = options.levels?.length ? [...options.levels] : undefined;
  // 1-2: scope and access, applied to every query below.
  const base = and(
    visibleWhere(principal, projectId, ["approved"]),
    inArray(memoryAssets.assetType, types),
    notExpired(),
    levels ? inArray(memories.level, levels) : undefined,
  );
  const joined = () =>
    db
      .select({ id: memoryAssets.id })
      .from(memoryAssets)
      .innerJoin(memories, eq(memories.assetId, memoryAssets.id));

  // 3-4: candidate lists. Stable high-level context first, then full-text, then exact matches.
  const pinnedQuery = joined()
    .where(and(base, eq(memories.level, "L3")))
    .orderBy(desc(memoryAssets.updatedAt))
    .limit(3);

  const lists: string[][] = [(await pinnedQuery).map((r) => r.id)];

  if (query) {
    const tsq = tsQuery(query);
    const fts = await db
      .select({ id: memoryAssets.id })
      .from(memoryAssets)
      .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
      .where(and(base, sql`${memoryAssets.search} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${memoryAssets.search}, ${tsq})`))
      .limit(30);
    lists.push(fts.map((r) => r.id));

    const tokens = exactTokens(query);
    if (tokens.length > 0) {
      const exact = await joined()
        .where(
          and(base, or(...tokens.map((t) => ilike(memoryAssets.searchText, `%${escapeLike(t)}%`)))),
        )
        .orderBy(desc(memoryAssets.updatedAt))
        .limit(20);
      lists.push(exact.map((r) => r.id));
    }
    // Slot for the vector list: empty while semantic search is off, so it adds nothing.
    lists.push([]);
  } else {
    const recent = await joined().where(base).orderBy(desc(memoryAssets.updatedAt)).limit(10);
    lists.push(recent.map((r) => r.id));
  }

  const ids = [...new Set(lists.flat())];
  if (ids.length === 0) return [];

  // Second access check: the rows are read again under the same filter before content leaves.
  const rows = await db
    .select({ asset: memoryAssets, memory: memories })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(and(base, inArray(memoryAssets.id, ids)));

  // 5-7: fuse, rank, deduplicate.
  const ranked = rankCandidates(
    rows.map((r) => ({
      id: r.asset.id,
      contentHash: r.asset.contentHash,
      confidence: r.memory.confidence,
      level: r.memory.level,
      row: r,
    })),
    rrf(lists),
  );

  // 8-9: budget, then the citations of what is left.
  const fitted = applyBudget(
    ranked.map((r) => ({
      ...r,
      content: r.row.memory.content,
    })),
    budget,
  );
  if (fitted.length === 0) return [];
  const sources = await db
    .select()
    .from(memorySources)
    .where(
      inArray(
        memorySources.assetId,
        fitted.map((f) => f.id),
      ),
    );

  return fitted.map((f) => ({
    assetId: f.id,
    memoryId: f.row.memory.id,
    level: f.row.memory.level,
    kind: f.row.memory.kind,
    title: f.row.asset.title,
    content: f.content,
    truncated: f.truncated,
    confidence: f.row.memory.confidence,
    origin: f.row.memory.source,
    score: f.score,
    updatedAt: f.row.asset.updatedAt,
    sources: sources
      .filter((s) => s.assetId === f.id)
      .map((s) => ({ sourceType: s.sourceType, sourceId: s.sourceId, locator: s.locator })),
  }));
}

/** Best effort: telemetry must never break a retrieval. No query text is stored, only its hash. */
async function recordTelemetry(
  principal: Principal,
  projectId: string,
  query: string,
  items: RetrievedItem[],
  latencyMs: number,
): Promise<void> {
  try {
    await db.insert(memoryRetrievals).values({
      projectId,
      requesterKind: principal.kind,
      agentId: principal.kind === "agent" ? principal.agentId : null,
      queryHash: queryHash(query),
      resultCount: items.length,
      assetIds: items.map((i) => i.assetId),
      latencyMs,
    });
    if (items.length > 0) {
      await db
        .update(memoryAssets)
        .set({ useCount: sql`${memoryAssets.useCount} + 1`, lastAccessedAt: new Date() })
        .where(
          inArray(
            memoryAssets.id,
            items.map((i) => i.assetId),
          ),
        );
    }
  } catch (error) {
    log.warn("memory.retrieval.telemetry_failed", {
      projectId,
      error: error instanceof Error ? error.name : "error",
    });
  }
}

/** One approved asset by id, under the same access filter as retrieval. Null when not readable. */
export async function readAsset(
  principal: Principal,
  projectId: string,
  assetId: string,
): Promise<RetrievedItem | null> {
  const [row] = await db
    .select({ asset: memoryAssets, memory: memories })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(
      and(
        visibleWhere(principal, projectId, ["approved"]),
        notExpired(),
        eq(memoryAssets.id, assetId),
      ),
    );
  if (!row) return null;
  const sources = await db.select().from(memorySources).where(eq(memorySources.assetId, assetId));
  return {
    assetId,
    memoryId: row.memory.id,
    level: row.memory.level,
    kind: row.memory.kind,
    title: row.asset.title,
    content: row.memory.content,
    truncated: false,
    confidence: row.memory.confidence,
    origin: row.memory.source,
    score: 0,
    updatedAt: row.asset.updatedAt,
    sources: sources.map((s) => ({
      sourceType: s.sourceType,
      sourceId: s.sourceId,
      locator: s.locator,
    })),
  };
}
