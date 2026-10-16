import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projectChanges } from "@/lib/db/schema";
import { writeJournalEntry } from "./journal";
import { type ChangeRow, planJournal } from "./journal-plan";

export interface ProcessResult {
  processed: number;
  created: number;
  updated: number;
  kept: number;
}

const BATCH = 200;

/**
 * Consumes the project's pending changes once: plans which facts changed, writes the memory
 * journal, and marks the changes processed, all in one transaction. Two runs at the same time
 * cannot both take the same rows (`skip locked`), so a change is never journaled twice.
 */
export async function processProjectChanges(projectId: string): Promise<ProcessResult> {
  return db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(projectChanges)
      .where(and(eq(projectChanges.projectId, projectId), isNull(projectChanges.processedAt)))
      .orderBy(asc(projectChanges.revision))
      .limit(BATCH)
      .for("update", { skipLocked: true });
    const result: ProcessResult = { processed: pending.length, created: 0, updated: 0, kept: 0 };
    if (pending.length === 0) return result;

    const rows: ChangeRow[] = pending.map((c) => ({
      revision: c.revision,
      type: c.type,
      entityType: c.entityType,
      entityId: c.entityId,
      detail: c.detail,
    }));
    for (const intent of planJournal(rows)) {
      const outcome = await writeJournalEntry(tx, projectId, intent);
      if (outcome === "created") result.created++;
      else if (outcome === "updated") result.updated++;
      else if (outcome === "kept") result.kept++;
    }
    await tx
      .update(projectChanges)
      .set({ processedAt: new Date() })
      .where(
        inArray(
          projectChanges.id,
          pending.map((c) => c.id),
        ),
      );
    return result;
  });
}

/** Cron safety net: projects whose changes were never consumed (a request ended early). */
export async function processPendingProjects(max = 25): Promise<number> {
  const rows = await db
    .selectDistinct({ projectId: projectChanges.projectId })
    .from(projectChanges)
    .where(isNull(projectChanges.processedAt))
    .limit(max);
  let done = 0;
  for (const { projectId } of rows) {
    const r = await processProjectChanges(projectId);
    done += r.processed;
  }
  return done;
}
