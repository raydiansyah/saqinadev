import { eq } from "drizzle-orm";
import { cronGuard } from "@/lib/cron/auth";
import { db } from "@/lib/db/client";
import { repositoryConnections } from "@/lib/db/schema";
import { syncProject } from "@/lib/docsync/engine";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PROJECTS = 25;

/**
 * Daily safety net: every project with document sync switched on is reconciled, which also
 * catches repository changes whose webhook was missed and pull requests merged meanwhile.
 */
export async function GET(request: Request) {
  const refused = cronGuard(request);
  if (refused) return refused;
  const rows = await db
    .select({ projectId: repositoryConnections.projectId })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.docSyncEnabled, true))
    .limit(MAX_PROJECTS);
  const results = { projects: rows.length, failed: 0, pushed: 0, pulled: 0, conflicts: 0 };
  for (const { projectId } of rows) {
    const summary = await syncProject(projectId).catch(() => null);
    if (!summary || summary.error) results.failed += 1;
    else {
      results.pushed += summary.pushed;
      results.pulled += summary.pulled;
      results.conflicts += summary.conflicts;
    }
  }
  log.info("docsync.cron", results);
  return Response.json(results);
}
