import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db/client";
import {
  documents,
  memoryAssets,
  projects,
  wikiChunks,
  wikiLinks,
  wikiSources,
} from "@/lib/db/schema";
import { hashContent } from "@/lib/docsync/hash";
import { isSyncType } from "@/lib/docsync/paths";
import type { WikiSourceType } from "@/lib/domain/memory";
import { log } from "@/lib/log";
import { scrubSecrets } from "@/lib/secrets/scan";
import { MAX_SOURCE_CHARS, parseMarkdown, refKey } from "./chunk";

export type IndexOutcome = "created" | "updated" | "kept" | "failed";

export interface WikiSourceInput {
  projectId: string;
  sourceType: WikiSourceType;
  /** Document slug, or repository path. */
  sourceRef: string;
  title: string;
  content: string;
  /** Version of a project document (null for repository files). */
  sourceVersion?: number | null;
}

const searchTextOf = (title: string, outline: string[]) => `${title}\n${outline.join("\n")}`;

/**
 * Reads one source into the wiki. Idempotent and incremental: an unchanged source (same content
 * hash) is not read again, so repeating an import never duplicates a page or re-chunks anything.
 * A page is a plain extraction of its source: no model writes it, so it claims nothing the
 * source does not, and every passage keeps the lines it came from.
 */
export async function indexWikiSource(tx: Tx, input: WikiSourceInput): Promise<IndexOutcome> {
  const hash = hashContent(input.content);
  const [existing] = await tx
    .select()
    .from(wikiSources)
    .where(
      and(
        eq(wikiSources.projectId, input.projectId),
        eq(wikiSources.sourceType, input.sourceType),
        eq(wikiSources.sourceRef, input.sourceRef),
      ),
    );

  if (existing && existing.contentHash === hash && existing.status === "ready") {
    // Same text under a new version number is not a change; remember the version so it is not stale.
    if ((input.sourceVersion ?? null) !== existing.sourceVersion) {
      await tx
        .update(wikiSources)
        .set({ sourceVersion: input.sourceVersion ?? null })
        .where(eq(wikiSources.id, existing.id));
    }
    return "kept";
  }

  const tooLarge = input.content.length > MAX_SOURCE_CHARS;
  const page = tooLarge
    ? null
    : parseMarkdown(input.content, input.title, {
        fromPath: input.sourceType === "repo_file" ? input.sourceRef : null,
      });
  // A token pasted into a document must not become a passage that agents and search hand out.
  const title = scrubSecrets((page?.title || input.title).slice(0, 200));
  const summary = scrubSecrets(page?.summary ?? "");
  const searchText = scrubSecrets(searchTextOf(title, page?.outline ?? []));

  let sourceId = existing?.id;
  let assetId = existing?.assetId;
  if (!existing) {
    const [project] = await tx
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    const [asset] = await tx
      .insert(memoryAssets)
      .values({
        assetType: "wiki",
        organizationId: project.organizationId,
        projectId: input.projectId,
        ownerId: null,
        visibility: "project",
        status: "approved",
        title,
        summary,
        searchText,
        contentHash: hash,
        lastIndexedAt: new Date(),
      })
      .returning({ id: memoryAssets.id });
    assetId = asset.id;
  } else {
    await tx
      .update(memoryAssets)
      .set({
        title,
        summary,
        searchText,
        contentHash: hash,
        version: sql`${memoryAssets.version} + 1`,
        lastIndexedAt: new Date(),
      })
      .where(eq(memoryAssets.id, existing.assetId));
    await tx.delete(wikiChunks).where(eq(wikiChunks.sourceId, existing.id));
    await tx.delete(wikiLinks).where(eq(wikiLinks.sourceId, existing.id));
  }

  const row = {
    title,
    summary,
    contentHash: hash,
    sourceVersion: input.sourceVersion ?? null,
    status: tooLarge ? ("failed" as const) : ("ready" as const),
    errorCode: tooLarge ? "too_large" : null,
    chunkCount: page?.chunks.length ?? 0,
    lastIndexedAt: new Date(),
  };
  if (existing) {
    await tx.update(wikiSources).set(row).where(eq(wikiSources.id, existing.id));
  } else {
    const [created] = await tx
      .insert(wikiSources)
      .values({
        projectId: input.projectId,
        assetId: assetId as string,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        ...row,
      })
      .returning({ id: wikiSources.id });
    sourceId = created.id;
  }
  if (!page || !sourceId) return "failed";

  if (page.chunks.length > 0) {
    await tx.insert(wikiChunks).values(
      page.chunks.map((c) => ({
        sourceId: sourceId as string,
        ...c,
        heading: scrubSecrets(c.heading),
        content: scrubSecrets(c.content),
      })),
    );
  }
  if (page.links.length > 0) {
    const known = await sourceIdsByKey(tx, input.projectId);
    await tx.insert(wikiLinks).values(
      page.links.map((l) => ({
        sourceId: sourceId as string,
        targetRef: l.targetRef,
        targetSourceId: known.get(l.targetRef) ?? null,
        label: l.label,
      })),
    );
  }
  // Links written earlier toward this source now have a target.
  await tx
    .update(wikiLinks)
    .set({ targetSourceId: sourceId })
    .where(
      and(
        eq(wikiLinks.targetRef, refKey(input.sourceRef)),
        sql`${wikiLinks.targetSourceId} is null`,
        sql`${wikiLinks.sourceId} in (select id from wiki_sources where project_id = ${input.projectId})`,
      ),
    );
  return existing ? "updated" : "created";
}

async function sourceIdsByKey(tx: Tx, projectId: string) {
  const rows = await tx
    .select({ id: wikiSources.id, ref: wikiSources.sourceRef })
    .from(wikiSources)
    .where(eq(wikiSources.projectId, projectId))
    .limit(2000);
  return new Map(rows.map((r) => [refKey(r.ref), r.id]));
}

/** Removes a source and everything derived from it: page, passages, links. */
export async function removeWikiSources(
  tx: Tx,
  projectId: string,
  sourceType: WikiSourceType,
  refs: string[],
): Promise<number> {
  if (refs.length === 0) return 0;
  const rows = await tx
    .select({ assetId: wikiSources.assetId })
    .from(wikiSources)
    .where(
      and(
        eq(wikiSources.projectId, projectId),
        eq(wikiSources.sourceType, sourceType),
        inArray(wikiSources.sourceRef, refs),
      ),
    );
  if (rows.length === 0) return 0;
  // The page row cascades to the source, its passages and its links.
  await tx.delete(memoryAssets).where(
    inArray(
      memoryAssets.id,
      rows.map((r) => r.assetId),
    ),
  );
  return rows.length;
}

export interface SyncResult {
  created: number;
  updated: number;
  kept: number;
  failed: number;
  removed: number;
}

/**
 * Brings the wiki in step with the project's documents (PRD, plan and custom documents; business
 * documents never enter). Only changed documents are read again. Each document is its own
 * transaction, so one bad source cannot hold up the rest.
 */
export async function syncWikiFromDocuments(projectId: string): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, kept: 0, failed: 0, removed: 0 };
  const docs = (await db.select().from(documents).where(eq(documents.projectId, projectId))).filter(
    (d) => isSyncType(d.type) && d.content.trim().length > 0,
  );
  for (const doc of docs) {
    try {
      const outcome = await db.transaction((tx) =>
        indexWikiSource(tx, {
          projectId,
          sourceType: "document",
          sourceRef: doc.slug,
          title: doc.title,
          content: doc.content,
          sourceVersion: doc.version,
        }),
      );
      result[outcome]++;
    } catch (error) {
      result.failed++;
      log.warn("wiki.index_failed", {
        projectId,
        ref: doc.slug,
        error: error instanceof Error ? error.name : "error",
      });
    }
  }
  const present = docs.map((d) => d.slug);
  const stale = await db
    .select({ ref: wikiSources.sourceRef })
    .from(wikiSources)
    .where(
      and(
        eq(wikiSources.projectId, projectId),
        eq(wikiSources.sourceType, "document"),
        present.length ? notInArray(wikiSources.sourceRef, present) : undefined,
      ),
    );
  result.removed = await db.transaction((tx) =>
    removeWikiSources(
      tx,
      projectId,
      "document",
      stale.map((s) => s.ref),
    ),
  );
  return result;
}
