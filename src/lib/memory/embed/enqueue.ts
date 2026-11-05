import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { memoryJobs, projectSettings } from "@/lib/db/schema";
import { enqueue } from "../queue";

/**
 * Asks for a reconcile. Only for a project that opted in, and at most one waiting job: a change that
 * arrives while one is queued adds nothing, because that job reads the project when it runs. A job
 * that is already running does not count, so a change during a run queues the next one.
 */
export async function enqueueEmbedProject(executor: Executor, projectId: string): Promise<boolean> {
  const [settings] = await executor
    .select({ on: projectSettings.semanticSearchEnabled })
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  if (!settings?.on) return false;
  const [open] = await executor
    .select({ id: memoryJobs.id })
    .from(memoryJobs)
    .where(
      and(
        eq(memoryJobs.projectId, projectId),
        eq(memoryJobs.kind, "embed_project"),
        inArray(memoryJobs.status, ["queued", "failed_retryable"]),
      ),
    )
    .limit(1);
  if (open) return false;
  return enqueue(executor, {
    projectId,
    kind: "embed_project",
    key: `embed:${projectId}:${Date.now()}:${randomUUID().slice(0, 8)}`,
    data: { projectId },
  });
}

/**
 * A new embedding model makes every stored vector stale: queue every project that opted in.
 * Pages through the projects by id; `limit` is a safety ceiling on how many one call visits.
 * `onQueued` hears each project that got a job, for a caller that schedules a run.
 */
export async function requeueAllEmbeddings(
  limit = 5000,
  onQueued?: (projectId: string) => void,
): Promise<number> {
  const PAGE = 200;
  let queued = 0;
  let visited = 0;
  let after: string | null = null;
  while (visited < limit) {
    const rows: { projectId: string }[] = await db
      .select({ projectId: projectSettings.projectId })
      .from(projectSettings)
      .where(
        after
          ? and(
              eq(projectSettings.semanticSearchEnabled, true),
              gt(projectSettings.projectId, after),
            )
          : eq(projectSettings.semanticSearchEnabled, true),
      )
      .orderBy(asc(projectSettings.projectId))
      .limit(Math.min(PAGE, limit - visited));
    if (rows.length === 0) break;
    for (const r of rows)
      if (await enqueueEmbedProject(db, r.projectId)) {
        queued++;
        onQueued?.(r.projectId);
      }
    visited += rows.length;
    after = rows[rows.length - 1].projectId;
  }
  return queued;
}
