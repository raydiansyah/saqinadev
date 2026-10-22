import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projectChanges } from "@/lib/db/schema";
import { enqueueWikiSync } from "@/lib/memory/wiki/schedule";
import { writeJournalEntry } from "./journal";
import { type ChangeRow, planJournal } from "./journal-plan";
import { reconcilePrdFindings } from "./prd-findings";

export interface ProcessResult {
  processed: number;
  created: number;
  updated: number;
  kept: number;
}

const BATCH = 200;
/** Changes that can make the PRD and the rest of the project disagree. */
const PRD_INPUTS = new Set(["document", "requirement", "task", "scope", "interview"]);

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
    // The PRD check reads the whole project, so it runs once per batch and only when something it
    // compares has changed.
    if (pending.some((c) => PRD_INPUTS.has(c.type.split(".")[0])))
      await reconcilePrdFindings(tx, projectId);
    // A changed document means the wiki has to read it again (a job: reading is not this request's work).
    if (pending.some((c) => c.type.startsWith("document."))) {
      const last = Math.max(...pending.map((c) => c.revision));
      await enqueueWikiSync(tx, projectId, `rev:${last}`);
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
