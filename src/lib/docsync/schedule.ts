import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { log } from "@/lib/log";
import { syncProject } from "./engine";

/**
 * Runs a sync after the response has been sent, so saving a document never waits for GitHub.
 * The database trigger has already flagged the project, so even if this does not run (a cold
 * stop, an error) the daily cron or the next Sync now picks the change up.
 */
export function scheduleDocSync(by: { slug: string } | { id: string }) {
  try {
    after(async () => {
      try {
        const id =
          "id" in by
            ? by.id
            : (
                await db
                  .select({ id: projects.id })
                  .from(projects)
                  .where(eq(projects.slug, by.slug))
              )[0]?.id;
        if (id) await syncProject(id, { onlyIfDirty: true });
      } catch (error) {
        log.warn("docsync.schedule_failed", { error: String(error) });
      }
    });
  } catch {
    // Not inside a request (a script or a test): nothing to schedule.
  }
}
