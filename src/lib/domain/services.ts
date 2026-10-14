/** Vocabularies for the public AI Services catalog (platform-level, managed by the Owner). */

export const SERVICE_CATEGORIES = [
  "daily",
  "business",
  "marketing",
  "cctv",
  "custom",
  "other",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** Built-in icon keys. Rendered by the UI; the Owner picks one, no uploads needed. */
export const SERVICE_ICONS = [
  "assistant",
  "business",
  "marketing",
  "camera",
  "puzzle",
  "chat",
  "chart",
  "bolt",
  "shield",
  "document",
] as const;
export type ServiceIcon = (typeof SERVICE_ICONS)[number];

export const PRICING_TYPES = [
  "fixed",
  "starting_from",
  "monthly",
  "custom_quote",
  "free_consultation",
  "contact",
] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

/** Types that carry a number. The others never have an amount. */
export const PRICED_TYPES: readonly PricingType[] = ["fixed", "starting_from", "monthly"];

export const CTA_TYPES = [
  "discuss",
  "consultation",
  "proposal",
  "start_project",
  "waitlist",
] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const INQUIRY_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "converted",
  "closed",
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const SERVICE_LOCALES = ["en", "id"] as const;
export type ServiceLocale = (typeof SERVICE_LOCALES)[number];

/** A value written once per language. */
export type Localized<T> = { en: T; id: T };
export type Step = { title: string; body: string };
export type Faq = { q: string; a: string };
