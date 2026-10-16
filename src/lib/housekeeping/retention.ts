/**
 * How long each kind of data is kept. The privacy policy and docs/standards/compliance.md quote
 * these numbers; change them here and in those documents in the same pull request.
 * Inquiries have no default: they stay until INQUIRY_RETENTION_DAYS is set (see service.ts).
 */
export const RETENTION_DAYS = {
  /** Read notifications. Unread ones stay until read. */
  notificationsRead: 90,
  /** GitHub redelivers within hours; a week of ids is plenty to catch a replay. */
  webhookDeliveries: 7,
  /** Per-request AI usage detail (13 months, enough for year-over-year cost review). */
  aiUsage: 395,
  /** Infrastructure audit trail (24 months). */
  auditEvents: 730,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export const cutoff = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);
