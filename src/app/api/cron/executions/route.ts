import { cronGuard } from "@/lib/cron/auth";
import { drainExecutions } from "@/lib/executions/worker";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The execution worker's safety net: takes every job that is due, including those a dead worker
 * left locked, and works until the time is up. A request also starts a drain after its response,
 * so this only has to catch what that missed. Call it every minute in production.
 */
export async function GET(request: Request) {
  const refused = cronGuard(request);
  if (refused) return refused;
  const handled = await drainExecutions({ deadlineMs: 240_000 });
  log.info("executions.cron", { handled });
  return Response.json({ handled });
}
