import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  docIndex,
  documents,
  memoryAssets,
  memoryRetrievals,
  wikiChunks,
  wikiSources,
} from "@/lib/db/schema";
import type { WikiSourceType } from "@/lib/domain/memory";
import { log } from "@/lib/log";
import { queryHash } from "../hash";
import type { Principal } from "../policy";
import { applyBudget, type Budget, resolveBudget } from "../retrieval/budget";
import { tsQuery } from "../retrieval/fts";
import { exactTokens, rrf } from "../retrieval/rank";
import { notExpired, visibleWhere } from "../scope";

export interface WikiPassage {
  sourceId: string;
  assetId: string;
  sourceType: WikiSourceType;
  sourceRef: string;
  title: string;
  heading: string;
  startLine: number;
  endLine: number;
  content: string;
  truncated: boolean;
  /** The source changed after it was read: the passage may no longer say this. */
  stale: boolean;
  /** The source is a document still in draft: not yet a settled statement. */
  draft: boolean;
  score: number;
}

export interface WikiResult {
  passages: WikiPassage[];
  semantic: "off";
  degraded?: "unavailable" | "timeout";
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** True when the text a source had when it was read is no longer what the source says now. */
export const isStale = sql<boolean>`case when ${wikiSources.sourceType} = 'document'
  then (${documents.id} is null or ${documents.version} is distinct from ${wikiSources.sourceVersion})
  else (${docIndex.id} is null or ${docIndex.hash} <> ${wikiSources.contentHash}) end`;

/** The source still exists. A passage whose document or file is gone is never returned. */
export const sourceExists = sql<boolean>`case when ${wikiSources.sourceType} = 'document'
  then ${documents.id} is not null
  else ${docIndex.id} is not null end`;

/**
 * Finds passages of project documents for a question. Same order as memory retrieval: access is
 * part of the query, then full-text and exact matches are fused, then the context budget is
 * applied. Every passage names its source, heading and lines, and says if its source has changed
 * since. No evidence returns no passages; the caller must say so rather than answer from nothing.
 */
export async function retrieveWiki(
  principal: Principal,
  projectId: string,
  options: { query: string; budget?: Partial<Budget> },
): Promise<WikiResult> {
  const budget = resolveBudget(options.budget);
  const query = options.query.trim().slice(0, 500);
  if (!query) return { passages: [], semantic: "off" };
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budget.timeoutMs);
  });
  try {
    const out = await Promise.race([run(principal, projectId, query, budget), timeout]);
    if (out === "timeout") return { passages: [], semantic: "off", degraded: "timeout" };
    await telemetry(principal, projectId, query, out, Date.now() - started);
    return { passages: out, semantic: "off" };
  } catch (error) {
    log.error("wiki.retrieval.failed", {
      projectId,
      error: error instanceof Error ? error.name : "error",
    });
    return { passages: [], semantic: "off", degraded: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

async function run(
  principal: Principal,
  projectId: string,
  query: string,
  budget: Budget,
): Promise<WikiPassage[]> {
  const base = and(
    visibleWhere(principal, projectId, ["approved"]),
    eq(memoryAssets.assetType, "wiki"),
    notExpired(),
    eq(wikiSources.status, "ready"),
  );
  const from = () =>
    db
      .select({ id: wikiChunks.id })
      .from(wikiChunks)
      .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
      .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId));

  const tsq = tsQuery(query);
  const fts = await from()
    .where(and(base, sql`${wikiChunks.search} @@ ${tsq}`))
    .orderBy(desc(sql`ts_rank(${wikiChunks.search}, ${tsq})`))
    .limit(30);
  const lists = [fts.map((r) => r.id)];
  const tokens = exactTokens(query);
  if (tokens.length > 0) {
    const exact = await from()
      .where(
        and(
          base,
          or(
            ...tokens.flatMap((t) => [
              ilike(wikiChunks.content, `%${escapeLike(t)}%`),
              ilike(wikiChunks.heading, `%${escapeLike(t)}%`),
            ]),
          ),
        ),
      )
      .limit(20);
    lists.push(exact.map((r) => r.id));
  }
  const ids = [...new Set(lists.flat())];
  if (ids.length === 0) return [];

  // Read again under the same access filter before any text leaves.
  const rows = await db
    .select({
      chunk: wikiChunks,
      source: wikiSources,
      stale: isStale,
      draft: sql<boolean>`coalesce(${documents.status} = 'draft', false)`,
    })
    .from(wikiChunks)
    .innerJoin(wikiSources, eq(wikiSources.id, wikiChunks.sourceId))
    .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
    .leftJoin(
      documents,
      and(
        eq(wikiSources.sourceType, "document"),
        eq(documents.projectId, wikiSources.projectId),
        eq(documents.slug, wikiSources.sourceRef),
      ),
    )
    .leftJoin(
      docIndex,
      and(
        eq(wikiSources.sourceType, "repo_file"),
        eq(docIndex.projectId, wikiSources.projectId),
        eq(docIndex.path, wikiSources.sourceRef),
      ),
    )
    .where(and(base, sourceExists, inArray(wikiChunks.id, ids)));

  const fused = rrf(lists);
  const ranked = rows
    .map((r) => ({ r, score: fused.get(r.chunk.id) ?? 0, content: r.chunk.content }))
    .sort((a, b) => b.score - a.score || a.r.chunk.id.localeCompare(b.r.chunk.id));
  // The same text read from two sources (an import and its document) is shown once, the better ranked.
  const seen = new Set<string>();
  const distinct = ranked.filter((x) => {
    const key = x.content.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return applyBudget(distinct, budget).map(({ r, score, content, truncated }) => ({
    sourceId: r.source.id,
    assetId: r.source.assetId,
    sourceType: r.source.sourceType,
    sourceRef: r.source.sourceRef,
    title: r.source.title,
    heading: r.chunk.heading,
    startLine: r.chunk.startLine,
    endLine: r.chunk.endLine,
    content,
    truncated,
    stale: Boolean(r.stale),
    draft: Boolean(r.draft),
    score,
  }));
}

async function telemetry(
  principal: Principal,
  projectId: string,
  query: string,
  passages: WikiPassage[],
  latencyMs: number,
) {
  try {
    await db.insert(memoryRetrievals).values({
      projectId,
      requesterKind: principal.kind,
      agentId: principal.kind === "agent" ? principal.agentId : null,
      queryHash: queryHash(query),
      resultCount: passages.length,
      assetIds: [...new Set(passages.map((p) => p.assetId))],
      latencyMs,
    });
  } catch (error) {
    log.warn("wiki.retrieval.telemetry_failed", {
      projectId,
      error: error instanceof Error ? error.name : "error",
    });
  }
}

/** "docs/PRD.md › Payments › Refunds, lines 7-9": how an answer names where it read this. */
export const citation = (p: Pick<WikiPassage, "sourceRef" | "heading" | "startLine" | "endLine">) =>
  `${p.sourceRef}${p.heading ? ` › ${p.heading}` : ""}, lines ${p.startLine}-${p.endLine}`;
