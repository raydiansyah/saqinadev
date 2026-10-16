import "server-only";
import { after } from "next/server";
import { log } from "@/lib/log";

/** Projects already queued in this process, so one request that changes ten things runs once. */
const queued = new Set<string>();

/**
 * Consumes a project's pending changes after the response has been sent, so a save never waits
 * for the journal. If this does not run (a cold stop, an error) the daily cron picks the
 * changes up: they stay pending until processed.
 */
export function scheduleProjectBrain(projectId: string) {
  if (queued.has(projectId)) return;
  try {
    after(async () => {
      queued.delete(projectId);
      try {
        // Loaded here to keep the activity service free of an import cycle.
        const { processProjectChanges } = await import("./process");
        await processProjectChanges(projectId);
      } catch (error) {
        log.warn("brain.process_failed", { projectId, error: String(error) });
      }
    });
    queued.add(projectId);
  } catch {
    // Not inside a request (a script or a test): the cron or an explicit call processes it.
  }
}
