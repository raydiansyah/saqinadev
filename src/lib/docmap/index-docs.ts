import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { upsertMemoryEntry } from "@/lib/brain/journal";
import type { Tx } from "@/lib/db/client";
import { docIndex, wikiSources } from "@/lib/db/schema";
import { hashContent } from "@/lib/docsync/hash";
import { log } from "@/lib/log";
import { indexWikiSource, removeWikiSources } from "@/lib/memory/wiki/index";
import { type ClassifiedBy, classifyDoc, type MapRole } from "./classify";

export interface IndexableDoc {
  path: string;
  content: string;
}

export interface IndexResult {
  added: number;
  changed: number;
  unchanged: number;
  removed: number;
  memories: number;
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const title = (doc: IndexableDoc) =>
  /^#\s+(.+)$/m.exec(doc.content)?.[1]?.trim() ||
  (doc.path.split("/").pop() ?? doc.path).replace(/\.\w+$/, "");

/** A memory file becomes one memory, keyed by its path so a re-read updates it in place. */
async function importMemoryFile(tx: Tx, projectId: string, doc: IndexableDoc) {
  const body = doc.content.replace(/^#\s+.+\n?/, "").trim() || doc.content.trim();
  const outcome = await upsertMemoryEntry(
    tx,
    projectId,
    {
      title: clip(title(doc), 160),
      content: clip(body || "(empty)", 4000),
      category: "product",
      importance: "normal",
    },
    { dedupeKey: `file:${doc.path}`, entityType: "file", entityId: doc.path, source: "imported" },
  );
  return outcome === "created" || outcome === "updated";
}

/**
 * Keeps the document map in step with the documents the project has. Only paths that are new
 * or whose hash changed are classified (and, for memory files, imported); the rest are not
 * even looked at. A role a person chose is kept. Paths that disappeared leave the map.
 *
 * `aiRoles` are paths a model chose for PRD/plan/tasks, used only where the rules found nothing
 * firmer than a content guess.
 */
export async function indexDocs(
  tx: Tx,
  projectId: string,
  docs: IndexableDoc[],
  aiRoles: Partial<Record<"prd" | "plan" | "tasks", string>> = {},
): Promise<IndexResult> {
  const result: IndexResult = { added: 0, changed: 0, unchanged: 0, removed: 0, memories: 0 };
  const known = new Map(
    (await tx.select().from(docIndex).where(eq(docIndex.projectId, projectId))).map((r) => [
      r.path,
      r,
    ]),
  );
  const aiByPath = new Map(Object.entries(aiRoles).map(([role, path]) => [path, role as MapRole]));
  // Files the wiki has already read: a file that was known before the wiki existed is read once.
  const wikiKnown = new Set(
    (
      await tx
        .select({ ref: wikiSources.sourceRef })
        .from(wikiSources)
        .where(and(eq(wikiSources.projectId, projectId), eq(wikiSources.sourceType, "repo_file")))
    ).map((r) => r.ref),
  );

  for (const doc of docs) {
    const hash = hashContent(doc.content);
    const row = known.get(doc.path);
    if (row && row.hash === hash) {
      result.unchanged++;
      if (!wikiKnown.has(doc.path) && row.role !== "memory")
        await readIntoWiki(tx, projectId, doc, row.role);
      continue;
    }
    let { role, by, confidence } = classifyDoc(doc);
    const ai = aiByPath.get(doc.path);
    if (ai && by === "content") {
      role = ai;
      by = "ai";
      confidence = 65;
    }
    // A person's correction outlives edits of the file.
    const keep = row?.classifiedBy === "user";
    const finalRole = keep && row ? row.role : role;
    const finalBy: ClassifiedBy = keep ? "user" : by;
    const finalConfidence = keep && row ? row.confidence : confidence;

    if (row) {
      await tx
        .update(docIndex)
        .set({
          hash,
          role: finalRole,
          classifiedBy: finalBy,
          confidence: finalConfidence,
          updatedAt: new Date(),
        })
        .where(eq(docIndex.id, row.id));
      result.changed++;
    } else {
      await tx.insert(docIndex).values({
        projectId,
        path: doc.path,
        hash,
        role: finalRole,
        classifiedBy: finalBy,
        confidence: finalConfidence,
      });
      result.added++;
    }
    if (finalRole === "memory" && (await importMemoryFile(tx, projectId, doc))) result.memories++;
    // Memory files are memories; every other document is also read into the wiki, by passage.
    await readIntoWiki(tx, projectId, doc, finalRole);
  }

  const present = new Set(docs.map((d) => d.path));
  const gone = [...known.keys()].filter((p) => !present.has(p));
  if (gone.length > 0) {
    await tx
      .delete(docIndex)
      .where(and(eq(docIndex.projectId, projectId), inArray(docIndex.path, gone)));
    result.removed = gone.length;
    await removeWikiSources(tx, projectId, "repo_file", gone);
  }
  return result;
}

/**
 * Reads one repository document into the wiki (or drops it when it became a memory file). Its own
 * savepoint and its own catch: a document the wiki cannot read must never fail the import.
 */
async function readIntoWiki(tx: Tx, projectId: string, doc: IndexableDoc, role: string) {
  try {
    await tx.transaction(async (sp) => {
      if (role === "memory") await removeWikiSources(sp, projectId, "repo_file", [doc.path]);
      else {
        await indexWikiSource(sp, {
          projectId,
          sourceType: "repo_file",
          sourceRef: doc.path,
          title: title(doc),
          content: doc.content,
        });
      }
    });
  } catch (error) {
    log.warn("wiki.import_failed", {
      projectId,
      error: error instanceof Error ? error.name : "error",
    });
  }
}

/** Everything in the map, grouped by role order, for readers (UI, agents, MCP). */
export async function listDocMap(tx: Pick<Tx, "select">, projectId: string) {
  return tx
    .select({
      path: docIndex.path,
      role: docIndex.role,
      classifiedBy: docIndex.classifiedBy,
      confidence: docIndex.confidence,
      updatedAt: docIndex.updatedAt,
    })
    .from(docIndex)
    .where(eq(docIndex.projectId, projectId))
    .orderBy(docIndex.role, docIndex.path);
}
