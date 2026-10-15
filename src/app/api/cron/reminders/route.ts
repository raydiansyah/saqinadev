import { cronGuard } from "@/lib/cron/auth";
import { log } from "@/lib/log";
import { runReminders } from "@/lib/reminders/service";

/**
 * Reminder cron. Idempotent: the reminder log makes repeated runs send nothing new.
 */
export async function GET(request: Request) {
  const refused = cronGuard(request);
  if (refused) return refused;
  const summary = await runReminders();
  log.info("reminders.run", { ...summary });
  return Response.json(summary);
}
