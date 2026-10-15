import * as z from "zod";
import { CURRENCIES, type Currency } from "@/lib/domain/business";
import {
  CTA_TYPES,
  PRICED_TYPES,
  PRICING_TYPES,
  SERVICE_CATEGORIES,
  SERVICE_ICONS,
} from "@/lib/domain/services";

/**
 * Owner input for a service. Everything is plain text: no HTML is accepted or rendered, so
 * stored content cannot become script when displayed (React escapes it too).
 */

// Strips control characters except newline and tab.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (s: string) => s.replace(CONTROL, "").trim();

const text = (max: number) => z.string().transform(clean).pipe(z.string().max(max));
const localized = <T extends z.ZodType>(item: T) => z.object({ en: item, id: item });
const lines = (itemMax: number, maxItems = 12) =>
  z.array(text(itemMax).pipe(z.string().min(1))).max(maxItems);

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set(["new", "preview", "inquiry", "api"]);

/** Images are external links: https only, no credentials, no private hosts. */
export function isSafeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^\[|^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export const serviceInput = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(SLUG)
      .refine((s) => !RESERVED_SLUGS.has(s), { message: "reserved" }),
    internalName: text(120).pipe(z.string().min(2)),
    category: z.enum(SERVICE_CATEGORIES),
    icon: z.enum(SERVICE_ICONS),
    imageUrl: z
      .union([z.literal(""), z.string().trim().max(500)])
      .refine((v) => v === "" || isSafeImageUrl(v), { message: "imageUrl" })
      .transform((v) => (v === "" ? null : v)),
    title: localized(text(120)),
    shortDescription: localized(text(280)),
    description: localized(text(6000)),
    timeline: localized(text(160)),
    priceLabel: localized(text(80)),
    ctaLabel: localized(text(60)),
    metaTitle: localized(text(70)),
    metaDescription: localized(text(170)),
    problems: localized(lines(240)),
    capabilities: localized(lines(240)),
    useCases: localized(lines(240)),
    included: localized(lines(240)),
    excluded: localized(lines(240)),
    requirements: localized(lines(240)),
    steps: localized(
      z.array(z.object({ title: text(100).pipe(z.string().min(1)), body: text(400) })).max(10),
    ),
    faqs: localized(
      z
        .array(
          z.object({ q: text(200).pipe(z.string().min(1)), a: text(1200).pipe(z.string().min(1)) }),
        )
        .max(15),
    ),
    relatedIds: z.array(z.uuid()).max(6),
    pricingType: z.enum(PRICING_TYPES),
    /** Minor units of the chosen currency. */
    priceAmount: z.number().int().min(0).max(9_000_000_000_000).nullable(),
    currency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
    showPrice: z.boolean(),
    ctaType: z.enum(CTA_TYPES),
    isPublished: z.boolean(),
    isPublic: z.boolean(),
    isComingSoon: z.boolean(),
    isFeatured: z.boolean(),
    displayOrder: z.number().int().min(0).max(100_000),
  })
  .superRefine((v, ctx) => {
    const priced = PRICED_TYPES.includes(v.pricingType);
    if (priced && v.priceAmount === null)
      ctx.addIssue({ code: "custom", path: ["priceAmount"], message: "required" });
    if (!priced && v.priceAmount !== null)
      ctx.addIssue({ code: "custom", path: ["priceAmount"], message: "notAllowed" });
    // A published service needs something to show in at least one language.
    if (v.isPublished && !v.title.en && !v.title.id)
      ctx.addIssue({ code: "custom", path: ["title"], message: "required" });
  });
export type ServiceInput = z.output<typeof serviceInput>;

export const inquiryInput = z.object({
  serviceSlug: z.string().trim().max(80).optional(),
  name: text(120).pipe(z.string().min(2)),
  company: text(160).default(""),
  email: z.email().trim().toLowerCase().max(200),
  whatsapp: text(40)
    .pipe(z.string().regex(/^(?:\+?[0-9][0-9 ()-]{5,})?$/))
    .default(""),
  message: text(3000).pipe(z.string().min(10)),
  consent: z.literal(true),
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(500).optional(),
  /** Cloudflare Turnstile token; only checked in production, where the form always sends one. */
  captchaToken: z.string().max(2048).optional(),
  locale: z.enum(["en", "id"]).default("en"),
});
export type InquiryInput = z.output<typeof inquiryInput>;
