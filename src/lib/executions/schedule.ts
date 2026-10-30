import "server-only";
import { after } from "next/server";
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
