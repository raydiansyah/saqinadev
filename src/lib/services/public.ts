import type { aiServices } from "@/lib/db/schema";
import type { Currency } from "@/lib/domain/business";
import type {
  CtaType,
  Faq,
  Localized,
  PricingType,
  ServiceCategory,
  ServiceIcon,
  ServiceLocale,
  Step,
} from "@/lib/domain/services";
import { PRICED_TYPES } from "@/lib/domain/services";

type Row = typeof aiServices.$inferSelect;

/** What a visitor may see. Built by an explicit whitelist: new columns never leak by default. */
export interface PublicPrice {
  type: PricingType;
  /** Only for priced types. Minor units. */
  amount: number | null;
  currency: Currency;
  label: string;
}

export interface PublicService {
  slug: string;
  category: ServiceCategory;
  icon: ServiceIcon;
  imageUrl: string | null;
  title: string;
  shortDescription: string;
  description: string;
  timeline: string;
  problems: string[];
  capabilities: string[];
  useCases: string[];
  included: string[];
  excluded: string[];
  requirements: string[];
  steps: Step[];
  faqs: Faq[];
  ctaType: CtaType;
  ctaLabel: string;
  isComingSoon: boolean;
  isFeatured: boolean;
  metaTitle: string;
  metaDescription: string;
  /** Null when the Owner hides prices: the object is absent, not just empty. */
  price: PublicPrice | null;
}

const other = (l: ServiceLocale): ServiceLocale => (l === "en" ? "id" : "en");

/** The visitor's language, falling back to the other one when empty. */
export function pick(value: Localized<string>, locale: ServiceLocale): string {
  return value[locale]?.trim() || value[other(locale)]?.trim() || "";
}
export function pickList<T>(value: Localized<T[]>, locale: ServiceLocale): T[] {
  return value[locale]?.length ? value[locale] : (value[other(locale)] ?? []);
}

/**
 * Visibility rule, in one place. Draft, hidden and archived services never reach a visitor,
 * whatever else is switched on. Coming Soon only changes the label.
 */
export const isPubliclyVisible = (s: {
  isPublished: boolean;
  isPublic: boolean;
  archivedAt: Date | null;
}) => s.isPublished && s.isPublic && s.archivedAt === null;

export function toPublicService(row: Row, locale: ServiceLocale): PublicService {
  const title = pick(row.title, locale);
  const shortDescription = pick(row.shortDescription, locale);
  const priced = PRICED_TYPES.includes(row.pricingType);
  return {
    slug: row.slug,
    category: row.category,
    icon: row.icon,
    imageUrl: row.imageUrl,
    title,
    shortDescription,
    description: pick(row.description, locale),
    timeline: pick(row.timeline, locale),
    problems: pickList(row.problems, locale),
    capabilities: pickList(row.capabilities, locale),
    useCases: pickList(row.useCases, locale),
    included: pickList(row.included, locale),
    excluded: pickList(row.excluded, locale),
    requirements: pickList(row.requirements, locale),
    steps: pickList(row.steps, locale),
    faqs: pickList(row.faqs, locale),
    ctaType: row.ctaType,
    ctaLabel: pick(row.ctaLabel, locale),
    isComingSoon: row.isComingSoon,
    isFeatured: row.isFeatured,
    metaTitle: pick(row.metaTitle, locale) || title,
    metaDescription: pick(row.metaDescription, locale) || shortDescription,
    price: row.showPrice
      ? {
          type: row.pricingType,
          amount: priced ? row.priceAmount : null,
          currency: row.currency,
          label: pick(row.priceLabel, locale),
        }
      : null,
  };
}
