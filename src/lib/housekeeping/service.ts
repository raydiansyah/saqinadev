import "server-only";
import { and, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, notifications, rateLimits, sessions, verifications } from "@/lib/db/schema";

import { cutoff, RETENTION_DAYS } from "./retention";

/**
 * Daily housekeeping: expired auth rows, spent rate-limit counters, read notifications and
 * audit events past their retention all go.
 */
export async function runMaintenance(now = new Date()) {
  const expiredSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const expiredVerifications = await db
    .delete(verifications)
    .where(lt(verifications.expiresAt, now))
    .returning({ id: verifications.id });
  // A counter older than a day can no longer affect any window the app uses.
  const staleLimits = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, sql`${now.toISOString()}::timestamptz - interval '1 day'`))
    .returning({ key: rateLimits.key });
  const readNotifications = await db
    .delete(notifications)
    .where(
      and(
        isNotNull(notifications.readAt),
        lt(notifications.readAt, cutoff(now, RETENTION_DAYS.notificationsRead)),
      ),
    )
    .returning({ id: notifications.id });
  const oldAudit = await db
    .delete(auditEvents)
    .where(lt(auditEvents.createdAt, cutoff(now, RETENTION_DAYS.auditEvents)))
    .returning({ id: auditEvents.id });
  return {
    sessions: expiredSessions.length,
    verifications: expiredVerifications.length,
    rateLimits: staleLimits.length,
    notifications: readNotifications.length,
    auditEvents: oldAudit.length,
  };
}
