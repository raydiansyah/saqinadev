import { inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { deliveryChecks, repositoryConnections } from "@/lib/db/schema";
import { type Answers, NO_ANSWERS } from "./consistency";

/** What the project card and overview need: the answers, and whether they are still awaited. */
export interface DeliverySummary extends Answers {
  /** Imported from GitHub and nobody has said yet how far the system is. */
  awaiting: boolean;
}

/** Summaries for many projects in two grouped queries. */
export async function loadDeliverySummaries(
  executor: Executor,
  ids: string[],
): Promise<Map<string, DeliverySummary>> {
  const out = new Map<string, DeliverySummary>();
  if (ids.length === 0) return out;
  const [rows, connections] = await Promise.all([
    executor
      .select({
        projectId: deliveryChecks.projectId,
        step: deliveryChecks.step,
        done: deliveryChecks.done,
      })
      .from(deliveryChecks)
      .where(inArray(deliveryChecks.projectId, ids)),
    executor
      .select({
        projectId: repositoryConnections.projectId,
        mode: repositoryConnections.docSyncMode,
      })
      .from(repositoryConnections)
      .where(inArray(repositoryConnections.projectId, ids)),
  ]);
  const imported = new Set(
    connections.filter((c) => c.mode === "pull_only").map((c) => c.projectId),
  );
  for (const id of ids) out.set(id, { ...NO_ANSWERS, awaiting: false });
  for (const r of rows) {
    const s = out.get(r.projectId);
    if (s) s[r.step] = r.done;
  }
  for (const [id, s] of out)
    s.awaiting = imported.has(id) && s.build === null && s.review === null && s.deploy === null;
  return out;
}
