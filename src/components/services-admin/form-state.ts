import { CURRENCY_DIGITS, type Currency } from "@/lib/domain/business";
import {
  type CtaType,
  type Faq,
  type Localized,
  PRICED_TYPES,
  type PricingType,
  type ServiceCategory,
  type ServiceIcon,
  type Step,
} from "@/lib/domain/services";
import { fromMinor, toMinor } from "@/lib/money";
import type { ServiceRow } from "@/lib/services/admin";

export const LIST_FIELDS = [
  "problems",
  "capabilities",
  "useCases",
  "included",
  "excluded",
  "requirements",
] as const;
export type ListField = (typeof LIST_FIELDS)[number];

export const TEXT_FIELDS = [
  "title",
  "shortDescription",
  "description",
  "timeline",
  "priceLabel",
  "ctaLabel",
  "metaTitle",
  "metaDescription",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** Editor state: the amount and order stay strings until submit. */
export interface FormState
  extends Record<TextField, Localized<string>>,
    Record<ListField, Localized<string[]>> {
  slug: string;
  internalName: string;
  category: ServiceCategory;
  icon: ServiceIcon;
  imageUrl: string;
  steps: Localized<Step[]>;
  faqs: Localized<Faq[]>;
  relatedIds: string[];
  pricingType: PricingType;
  /** Major units of the chosen currency, as typed. */
  priceAmount: string;
  currency: Currency;
  showPrice: boolean;
  ctaType: CtaType;
  isPublished: boolean;
  isPublic: boolean;
  isComingSoon: boolean;
  isFeatured: boolean;
  displayOrder: string;
}

const both = <T>(make: () => T): Localized<T> => ({ en: make(), id: make() });

export function emptyState(): FormState {
  const state: Partial<FormState> = {
    slug: "",
    internalName: "",
    category: "business",
    icon: "puzzle",
    imageUrl: "",
    steps: both<Step[]>(() => []),
    faqs: both<Faq[]>(() => []),
    relatedIds: [],
    pricingType: "contact",
    priceAmount: "",
    currency: "IDR",
    showPrice: false,
    ctaType: "discuss",
    isPublished: false,
    isPublic: true,
    isComingSoon: false,
    isFeatured: false,
    displayOrder: "0",
  };
  for (const f of TEXT_FIELDS) state[f] = both(() => "");
  for (const f of LIST_FIELDS) state[f] = both<string[]>(() => []);
  return state as FormState;
}

export function stateFromRow(row: ServiceRow): FormState {
  const state: FormState = {
    ...emptyState(),
    slug: row.slug,
    internalName: row.internalName,
    category: row.category,
    icon: row.icon,
    imageUrl: row.imageUrl ?? "",
    steps: row.steps,
    faqs: row.faqs,
    relatedIds: row.relatedIds,
    pricingType: row.pricingType,
    priceAmount: row.priceAmount === null ? "" : String(fromMinor(row.priceAmount, row.currency)),
    currency: row.currency,
    showPrice: row.showPrice,
    ctaType: row.ctaType,
    isPublished: row.isPublished,
    isPublic: row.isPublic,
    isComingSoon: row.isComingSoon,
    isFeatured: row.isFeatured,
    displayOrder: String(row.displayOrder),
  };
  for (const f of TEXT_FIELDS) state[f] = row[f];
  for (const f of LIST_FIELDS) state[f] = row[f];
  return state;
}

const mapBoth = <T, R>(v: Localized<T>, map: (x: T) => R): Localized<R> => ({
  en: map(v.en),
  id: map(v.id),
});

/** Major-unit text ("1500000", "12,5") to minor units; null when it is not a valid amount. */
export function parseMajor(raw: string, currency: Currency): number | null {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  if ((text.split(".")[1]?.length ?? 0) > CURRENCY_DIGITS[currency]) return null;
  const minor = toMinor(Number(text), currency);
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Builds the payload the server schema expects. Also reports problems the client can detect
 * itself (amount, order), keyed by field path, so the form can point at them without a round trip.
 */
export function toPayload(state: FormState): {
  payload: Record<string, unknown>;
  problems: Record<string, string>;
} {
  const problems: Record<string, string> = {};
  let priceAmount: number | null = null;
  if (PRICED_TYPES.includes(state.pricingType)) {
    priceAmount = parseMajor(state.priceAmount, state.currency);
    if (priceAmount === null) problems.priceAmount = "invalid";
  }
  const order = state.displayOrder.trim();
  const displayOrder = /^\d+$/.test(order) ? Number(order) : Number.NaN;
  if (!Number.isInteger(displayOrder) || displayOrder > 100_000) problems.displayOrder = "invalid";

  const payload: Record<string, unknown> = {
    ...state,
    priceAmount,
    displayOrder: Number.isNaN(displayOrder) ? 0 : displayOrder,
    // Blank rows are dropped instead of failing validation.
    steps: mapBoth(state.steps, (rows) => rows.filter((r) => r.title.trim() || r.body.trim())),
    faqs: mapBoth(state.faqs, (rows) => rows.filter((r) => r.q.trim() || r.a.trim())),
  };
  for (const f of LIST_FIELDS)
    payload[f] = mapBoth(state[f], (items) => items.map((i) => i.trim()).filter(Boolean));
  return { payload, problems };
}
