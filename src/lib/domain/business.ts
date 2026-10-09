/**
 * Phase 5 vocabularies: organizations, clients, scope and project billing. Stored as text,
 * like the rest of the domain enums.
 */

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const CLIENT_STATUSES = ["active", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/** How a feature relates to the agreed scope. */
export const SCOPE_CATEGORIES = ["included", "excluded", "optional", "future"] as const;
export type ScopeCategory = (typeof SCOPE_CATEGORIES)[number];

/** Stored invoice states. "overdue" is derived at read time from the due date. */
export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "sent",
  "partially_paid",
  "paid",
  "cancelled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type EffectiveInvoiceStatus = InvoiceStatus | "overdue";

export const PAYMENT_METHODS = ["bank_transfer", "cash", "manual", "gateway", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["confirmed", "void"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** ISO 4217 codes with the number of minor-unit digits. */
export const CURRENCY_DIGITS = { IDR: 0, USD: 2, SGD: 2, MYR: 2, EUR: 2, AUD: 2 } as const;
export type Currency = keyof typeof CURRENCY_DIGITS;
export const CURRENCIES = Object.keys(CURRENCY_DIGITS) as Currency[];

export const UI_MODES = ["simple", "advanced"] as const;
export type UiMode = (typeof UI_MODES)[number];

// ── Phase 6: client engagement, change requests, maintenance, reminders ─────────────────

export const REQUEST_KINDS = ["question", "feature", "bug", "maintenance"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = ["open", "in_review", "resolved", "declined", "converted"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Who pays for a post-launch request. Warranty is not maintenance. */
export const MAINTENANCE_CLASSES = ["unclassified", "warranty", "included", "paid"] as const;
export type MaintenanceClass = (typeof MAINTENANCE_CLASSES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "changes_requested", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const CHANGE_REQUEST_STATUSES = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "cancelled",
  "done",
] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const SCOPE_STATUSES = ["within", "out_of_scope", "unknown"] as const;
export type ScopeStatus = (typeof SCOPE_STATUSES)[number];

export const MAINTENANCE_CYCLES = ["monthly", "quarterly", "yearly", "one_time"] as const;
export type MaintenanceCycle = (typeof MAINTENANCE_CYCLES)[number];

export const MAINTENANCE_STATUSES = ["active", "ended", "cancelled"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const REMINDER_KINDS = [
  "invoice_due",
  "invoice_overdue",
  "approval_pending",
  "change_request_pending",
  "maintenance_renewal",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_AUDIENCES = ["team", "client", "both"] as const;
export type ReminderAudience = (typeof REMINDER_AUDIENCES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
