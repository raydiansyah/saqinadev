import { timingSafeEqual } from "node:crypto";
import { log } from "@/lib/log";
import { runReminders } from "@/lib/reminders/service";

/**
 * Reminder cron. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`; anything else
 * is refused. Idempotent: the reminder log makes repeated runs send nothing new.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const summary = await runReminders();
  log.info("reminders.run", { ...summary });
  return Response.json(summary);
}
