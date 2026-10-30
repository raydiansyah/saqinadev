import "server-only";
import { log } from "@/lib/log";
import { safeError } from "./conclude";
import { runDispatchJob } from "./dispatcher";
import { claimJobs, failJob, finishJob, type JobRow } from "./jobs";
import { runPlanJob } from "./planner";
import { runTaskJob } from "./runner";
import type { EngineOptions } from "./task-executor";

/** Jobs taken at once. Matches the default parallel limit of an execution. */
const BATCH = 3;

async function handle(job: JobRow, options: EngineOptions): Promise<void> {
  try {
    if (job.kind === "plan") await runPlanJob(job.executionId, options);
    else if (job.kind === "dispatch") await runDispatchJob(job.executionId);
    else await runTaskJob(job, options);
    await finishJob(job.id);
  } catch (error) {
    log.error("execution.job_failed", { jobId: job.id, kind: job.kind, error: String(error) });
    await failJob(job, safeError(error));
  }
}

export interface DrainOptions extends EngineOptions {
  /** Stop starting new jobs after this many milliseconds. */
  deadlineMs?: number;
  maxJobs?: number;
  /** The clock for deciding which jobs are due. Tests move it past a retry delay. */
  now?: () => Date;
}

/**
 * Works through the due jobs until none are left or the time is up. Safe to run from several
 * places at once (a request's `after`, the cron route): each job is taken by one worker only.
 * Returns how many jobs it handled.
 */
export async function drainExecutions(options: DrainOptions = {}): Promise<number> {
  const stop = Date.now() + (options.deadlineMs ?? 240_000);
  const limit = options.maxJobs ?? 200;
  let handled = 0;
  while (Date.now() < stop && handled < limit) {
    const jobs = await claimJobs(BATCH, options.now?.() ?? new Date());
    if (jobs.length === 0) break;
    await Promise.all(jobs.map((job) => handle(job, options)));
    handled += jobs.length;
  }
  return handled;
}
