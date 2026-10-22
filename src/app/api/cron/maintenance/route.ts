import { processPendingProjects } from "@/lib/brain/process";
import { cronGuard } from "@/lib/cron/auth";
import { runMaintenance } from "@/lib/housekeeping/service";
import { log } from "@/lib/log";
import { enqueueCodeSweep } from "@/lib/memory/code/schedule";
import { processMemoryJobs } from "@/lib/memory/jobs";
import { enqueueWikiBackfill } from "@/lib/memory/wiki/schedule";

export const maxDuration = 300;

/** Daily housekeeping (expired auth rows, rate-limit counters, optional inquiry retention). */
export async function GET(request: Request) {
  const refused = cronGuard(request);
  if (refused) return refused;
  const summary = {
    ...(await runMaintenance()),
    journaled: await processPendingProjects(),
    wikiQueued: await enqueueWikiBackfill(),
    codeQueued: await enqueueCodeSweep(),
    memoryJobs: await processMemoryJobs({ limit: 20 }),
  };
  log.info("maintenance.run", { ...summary });
  return Response.json(summary);
}
