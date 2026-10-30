import "server-only";
import { and, eq, lt, lte, or } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { executionJobs } from "@/lib/db/schema";
import { log } from "@/lib/log";

/**
 * Works through the due jobs after the response is sent, so starting an execution never waits for
 * a model. If it does not run (a cold stop, an error) the cron route picks the jobs up: they stay
 * queued until handled.
 */
export function scheduleDrain(): void {
  try {
    after(async () => {
      try {
        const { drainExecutions } = await import("./worker");
        await drainExecutions();
      } catch (error) {
        log.warn("execution.drain_failed", { error: String(error) });
      }
    });
  } catch {
    // Not inside a request (a script or a test): the cron or an explicit drain runs them.
  }
}

/**
 * Called when someone is looking at an execution: if a job of it is due and no worker has taken
 * it (a cold stop, a missed cron), a drain starts. One cheap query; nothing runs when idle.
 */
export async function nudgeWorker(executionId: string): Promise<void> {
  const now = new Date();
  const [due] = await db
    .select({ id: executionJobs.id })
    .from(executionJobs)
    .where(
      and(
        eq(executionJobs.executionId, executionId),
        or(
          and(eq(executionJobs.status, "pending"), lte(executionJobs.runAfter, now)),
          and(eq(executionJobs.status, "running"), lt(executionJobs.lockedUntil, now)),
        ),
      ),
    )
    .limit(1);
  if (due) scheduleDrain();
}
