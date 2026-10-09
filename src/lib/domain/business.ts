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
