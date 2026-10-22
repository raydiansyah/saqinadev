import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  docIndex,
  documents,
  memoryAssets,
  wikiChunks,
  wikiLinks,
  wikiSources,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { principalOf } from "../access";
import { notExpired, visibleWhere } from "../scope";
import { sourceExists } from "./retrieve";

const readable = (access: ProjectAccess) =>
  and(
    visibleWhere(principalOf(access), access.project.id, ["approved"]),
    eq(memoryAssets.assetType, "wiki"),
    notExpired(),
  );

export interface WikiSourceRow {
  id: string;
  sourceType: "document" | "repo_file";
  sourceRef: string;
  title: string;
  summary: string;
  status: "ready" | "failed";
  errorCode: string | null;
  chunkCount: number;
  lastIndexedAt: Date;
  stale: boolean;
}

/** Sources of the project the viewer may read, with whether each has changed since it was read. */
export async function listWikiSources(
  access: ProjectAccess,
  limit = 200,
): Promise<WikiSourceRow[]> {
  const rows = await db
    .select({
      s: wikiSources,
      docVersion: documents.version,
      docId: documents.id,
      indexHash: docIndex.hash,
    })
    .from(wikiSources)
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
    .where(and(readable(access), sourceExists, eq(wikiSources.projectId, access.project.id)))
    .orderBy(desc(wikiSources.lastIndexedAt))
    .limit(limit);
  return rows.map(({ s, docVersion, docId, indexHash }) => ({
    id: s.id,
    sourceType: s.sourceType,
    sourceRef: s.sourceRef,
    title: s.title,
    summary: s.summary,
    status: s.status,
    errorCode: s.errorCode,
    chunkCount: s.chunkCount,
    lastIndexedAt: s.lastIndexedAt,
    stale:
      s.sourceType === "document"
        ? !docId || docVersion !== s.sourceVersion
        : indexHash === null || indexHash !== s.contentHash,
  }));
}

/** One page: its outline of passages, what it links to and what links to it. NOT_FOUND if unreadable. */
export async function getWikiPage(access: ProjectAccess, id: string) {
  const [row] = await db
    .select({ s: wikiSources })
    .from(wikiSources)
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
    .where(
      and(
        readable(access),
        sourceExists,
        eq(wikiSources.id, id),
        eq(wikiSources.projectId, access.project.id),
      ),
    );
  if (!row) throw new AppError("NOT_FOUND");
  const [chunks, out, back] = await Promise.all([
    db
      .select()
      .from(wikiChunks)
      .where(eq(wikiChunks.sourceId, id))
      .orderBy(asc(wikiChunks.ordinal))
      .limit(500),
    db.select().from(wikiLinks).where(eq(wikiLinks.sourceId, id)).limit(100),
    db
      .select({ id: wikiSources.id, title: wikiSources.title, sourceRef: wikiSources.sourceRef })
      .from(wikiLinks)
      .innerJoin(wikiSources, eq(wikiSources.id, wikiLinks.sourceId))
      .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
      .where(and(eq(wikiLinks.targetSourceId, id), readable(access)))
      .limit(100),
  ]);
  const targetIds = out.flatMap((l) => (l.targetSourceId ? [l.targetSourceId] : []));
  const targets = targetIds.length
    ? await db
        .select({ id: wikiSources.id, title: wikiSources.title })
        .from(wikiSources)
        .innerJoin(memoryAssets, eq(memoryAssets.id, wikiSources.assetId))
        .where(and(inArray(wikiSources.id, targetIds), readable(access)))
    : [];
  const titleOf = new Map(targets.map((t) => [t.id, t.title]));
  return {
    source: row.s,
    chunks,
    links: out.map((l) => ({
      label: l.label,
      targetRef: l.targetRef,
      targetId: l.targetSourceId,
      targetTitle: l.targetSourceId ? (titleOf.get(l.targetSourceId) ?? null) : null,
    })),
    backlinks: back,
  };
}
