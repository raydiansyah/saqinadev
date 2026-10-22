import "server-only";
import { after } from "next/server";
import { log } from "@/lib/log";

const queued = new Set<string>();

/**
 * Runs due memory jobs after the response is sent, so a chat reply never waits for extraction.
 * If it does not run (a cold stop, an error) the maintenance cron picks the jobs up: they stay
 * queued until processed.
 */
export function scheduleMemoryJobs(projectId: string) {
  if (queued.has(projectId)) return;
  try {
    after(async () => {
      queued.delete(projectId);
      try {
        const { processMemoryJobs } = await import("./jobs");
        await processMemoryJobs();
      } catch (error) {
        log.warn("memory.jobs.schedule_failed", { projectId, error: String(error) });
      }
    });
    queued.add(projectId);
  } catch {
    // Not inside a request (a script or a test): the cron or an explicit call runs them.
  }
}
