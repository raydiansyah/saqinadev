import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projects, repositoryConnections } from "@/lib/db/schema";
import { log } from "@/lib/log";
import { syncProject } from "./engine";

/**
 * For a project whose documents come from GitHub (pull-only): reads GitHub now, unless it was read
 * less than `maxAgeMs` ago. Best effort: a GitHub outage never blocks what the person is doing.
 */
export async function pullFromGithub(
  by: { slug: string } | { projectId: string },
  maxAgeMs = 0,
): Promise<void> {
  try {
    const [row] = await db
      .select({
        projectId: repositoryConnections.projectId,
        mode: repositoryConnections.docSyncMode,
        enabled: repositoryConnections.docSyncEnabled,
        at: repositoryConnections.docsSyncedAt,
      })
      .from(repositoryConnections)
      .innerJoin(projects, eq(projects.id, repositoryConnections.projectId))
      .where(
        "slug" in by
          ? eq(projects.slug, by.slug)
          : eq(repositoryConnections.projectId, by.projectId),
      );
    if (!row?.enabled || row.mode !== "pull_only") return;
    if (maxAgeMs > 0 && row.at && Date.now() - row.at.getTime() < maxAgeMs) return;
    await syncProject(row.projectId);
  } catch (error) {
    log.warn("docsync.pull_failed", { error: String(error) });
  }
}
