import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordActivity } from "@/lib/activity/service";
import type { Tx } from "@/lib/db/client";
import { decisions, documents, memories } from "@/lib/db/schema";
import type { MemoryCategory } from "@/lib/domain/enums";
import type { JournalIntent } from "./journal-plan";

interface Entry {
  title: string;
  content: string;
  category: MemoryCategory;
  importance: "high" | "normal";
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Turns an intent into the memory text by reading the entity as it is now, not as the change
 * described it. Returns null when the entity is gone: there is nothing true left to remember.
 */
async function render(tx: Tx, projectId: string, intent: JournalIntent): Promise<Entry | null> {
  switch (intent.kind) {
    case "decision": {
      const [d] = await tx
        .select()
        .from(decisions)
        .where(and(eq(decisions.id, intent.entityId ?? ""), eq(decisions.projectId, projectId)));
      if (!d) return null;
      const status = d.status === "accepted" ? "" : ` Status: ${d.status}.`;
      return {
        title: clip(`Decision #${String(d.number).padStart(3, "0")}: ${d.question}`, 160),
        content: clip(`Chose "${d.selected}". ${d.reason}${status}`.trim(), 4000),
        category: "decision",
        importance: d.status === "accepted" ? "high" : "normal",
      };
    }
    case "document": {
      const slug = text(intent.detail?.slug);
      const [doc] = await tx
        .select({
          version: documents.version,
          status: documents.status,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .where(and(eq(documents.projectId, projectId), eq(documents.slug, slug)));
      if (!doc) return null;
      return {
        title: `${slug.toUpperCase()}: current state`,
        content: `The ${slug.toUpperCase()} is at version ${doc.version} (${doc.status}), last changed ${doc.updatedAt.toISOString().slice(0, 10)}. Read it before relying on earlier assumptions.`,
        category: "product",
        importance: slug === "prd" ? "high" : "normal",
      };
    }
    case "stack": {
      const key = text(intent.detail?.title);
      const value = text(intent.detail?.value);
      if (!key) return null;
      return {
        title: clip(`Stack: ${key}`, 160),
        content: clip(value ? `${key} is ${value}.` : `${key} is not set.`, 4000),
        category: "technical",
        importance: "normal",
      };
    }
    case "repository": {
      const name = text(intent.detail?.title);
      if (!name) return null;
      const provider = text(intent.detail?.provider);
      return {
        title: "Repository",
        content: clip(`Connected to ${name}${provider ? ` (${provider})` : ""}.`, 4000),
        category: "integration",
        importance: "normal",
      };
    }
  }
}

export type JournalResult = "created" | "updated" | "kept" | "skipped";

/**
 * Writes one journal memory directly (no approval step): concise, keyed so the same fact is
 * updated in place, and never over text a person has edited. Unchanged text writes nothing, so a
 * burst of identical changes does not move the project's revision.
 */
export async function writeJournalEntry(
  tx: Tx,
  projectId: string,
  intent: JournalIntent,
): Promise<JournalResult> {
  const entry = await render(tx, projectId, intent);
  if (!entry) return "skipped";
  const [row] = await tx
    .insert(memories)
    .values({
      projectId,
      ...entry,
      source: "system",
      createdBy: null,
      entityType: intent.entityType,
      entityId: intent.entityId,
      dedupeKey: intent.dedupeKey,
    })
    .onConflictDoUpdate({
      target: [memories.projectId, memories.dedupeKey],
      targetWhere: sql`${memories.dedupeKey} is not null`,
      set: { ...entry, entityId: intent.entityId, updatedAt: new Date() },
      // A person's edit wins, and identical text is not a change.
      setWhere: and(
        isNull(memories.humanEditedAt),
        sql`(${memories.title}, ${memories.content}, ${memories.importance}, ${memories.category}) is distinct from (excluded.title, excluded.content, excluded.importance, excluded.category)`,
      ),
    })
    .returning({ id: memories.id, inserted: sql<boolean>`(xmax = 0)` });
  if (!row) return "kept";
  await recordActivity(tx, {
    projectId,
    actorId: null,
    type: row.inserted ? "memory.created" : "memory.updated",
    entityType: "memory",
    entityId: row.id,
    metadata: { title: entry.title, category: entry.category, origin: "system" },
  });
  return row.inserted ? "created" : "updated";
}
