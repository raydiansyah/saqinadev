import "server-only";
import { and, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  rateLimits,
  serviceInquiries,
  sessions,
  verifications,
  webhookDeliveries,
} from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  // GitHub redelivers within hours at most; a week of ids is plenty to catch a replay.
  const staleDeliveries = await db
    .delete(webhookDeliveries)
    .where(lt(webhookDeliveries.receivedAt, new Date(now.getTime() - 7 * DAY_MS)))
    .returning({ id: webhookDeliveries.id });

  const days = retentionDays(env.INQUIRY_RETENTION_DAYS);
  let inquiries = 0;
  if (days) {
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const removed = await db
      .delete(serviceInquiries)
      .where(and(lt(serviceInquiries.createdAt, cutoff), ne(serviceInquiries.status, "converted")))
      .returning({ id: serviceInquiries.id });
    inquiries = removed.length;
  }
  return {
    sessions: expiredSessions.length,
    verifications: expiredVerifications.length,
    rateLimits: staleLimits.length,
    webhookDeliveries: staleDeliveries.length,
    inquiries,
    inquiryRetentionDays: days,
  };
}
