import "server-only";
import { and, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  aiUsageRecords,
  auditEvents,
  notifications,
  rateLimits,
  serviceInquiries,
  sessions,
  verifications,
  webhookDeliveries,
} from "@/lib/db/schema";

import { cutoff, RETENTION_DAYS } from "./retention";

/** Positive whole number of days from the environment, or null when unset or invalid. */
export function retentionDays(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Daily housekeeping: expired auth rows and spent rate-limit counters always go. Service
 * inquiries (personal data) are deleted only when INQUIRY_RETENTION_DAYS is set, and converted
 * ones are kept because they already live on as a client record.
 */
export async function runMaintenance(
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
) {
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

  const staleDeliveries = await db
    .delete(webhookDeliveries)
    .where(lt(webhookDeliveries.receivedAt, cutoff(now, RETENTION_DAYS.webhookDeliveries)))
    .returning({ id: webhookDeliveries.id });
  const readNotifications = await db
    .delete(notifications)
    .where(
      and(
        isNotNull(notifications.readAt),
        lt(notifications.readAt, cutoff(now, RETENTION_DAYS.notificationsRead)),
      ),
    )
    .returning({ id: notifications.id });
  const oldUsage = await db
    .delete(aiUsageRecords)
    .where(lt(aiUsageRecords.createdAt, cutoff(now, RETENTION_DAYS.aiUsage)))
    .returning({ id: aiUsageRecords.id });
  const oldAudit = await db
    .delete(auditEvents)
    .where(lt(auditEvents.createdAt, cutoff(now, RETENTION_DAYS.auditEvents)))
    .returning({ id: auditEvents.id });

  const days = retentionDays(env.INQUIRY_RETENTION_DAYS);
  let inquiries = 0;
  if (days) {
    const inquiryCutoff = cutoff(now, days);
    const removed = await db
      .delete(serviceInquiries)
      .where(
        and(
          lt(serviceInquiries.createdAt, inquiryCutoff),
          ne(serviceInquiries.status, "converted"),
        ),
      )
      .returning({ id: serviceInquiries.id });
    inquiries = removed.length;
  }
  return {
    sessions: expiredSessions.length,
    verifications: expiredVerifications.length,
    rateLimits: staleLimits.length,
    webhookDeliveries: staleDeliveries.length,
    notifications: readNotifications.length,
    aiUsage: oldUsage.length,
    auditEvents: oldAudit.length,
    inquiries,
    inquiryRetentionDays: days,
  };
}
