import { cronGuard } from "@/lib/cron/auth";
import { runMaintenance } from "@/lib/housekeeping/service";
import { log } from "@/lib/log";

/** Daily housekeeping (expired auth rows, rate-limit counters, optional inquiry retention). */
export async function GET(request: Request) {
  const refused = cronGuard(request);
  if (refused) return refused;
  const summary = await runMaintenance();
  log.info("maintenance.run", { ...summary });
  return Response.json(summary);
}
