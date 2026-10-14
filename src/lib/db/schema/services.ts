import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Currency } from "@/lib/domain/business";
import type {
  CtaType,
  Faq,
  InquiryStatus,
  Localized,
  PricingType,
  ServiceCategory,
  ServiceIcon,
  Step,
} from "@/lib/domain/services";
import { users } from "./auth";
import { clients } from "./organizations";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

const text2 = (name: string) =>
  jsonb(name).$type<Localized<string>>().notNull().default({ en: "", id: "" });
const list2 = (name: string) =>
  jsonb(name).$type<Localized<string[]>>().notNull().default({ en: [], id: [] });

/**
 * The public AI Services catalog. Commercial offerings shown on the website; unrelated to AI
 * providers/models/agents, subscription plans and client-project billing. Owner-managed.
 */
export const aiServices = pgTable(
  "ai_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    /** Old slugs of a published service; they redirect to the current one. */
    previousSlugs: text("previous_slugs").array().notNull().default([]),
    internalName: text("internal_name").notNull(),
    category: text("category").$type<ServiceCategory>().notNull(),
    icon: text("icon").$type<ServiceIcon>().notNull().default("puzzle"),
    imageUrl: text("image_url"),

    title: text2("title"),
    shortDescription: text2("short_description"),
    description: text2("description"),
    timeline: text2("timeline"),
    priceLabel: text2("price_label"),
    ctaLabel: text2("cta_label"),
    metaTitle: text2("meta_title"),
    metaDescription: text2("meta_description"),

    problems: list2("problems"),
    capabilities: list2("capabilities"),
    useCases: list2("use_cases"),
    included: list2("included"),
    excluded: list2("excluded"),
    requirements: list2("requirements"),
    steps: jsonb("steps").$type<Localized<Step[]>>().notNull().default({ en: [], id: [] }),
    faqs: jsonb("faqs").$type<Localized<Faq[]>>().notNull().default({ en: [], id: [] }),
    relatedIds: jsonb("related_ids").$type<string[]>().notNull().default([]),

    pricingType: text("pricing_type").$type<PricingType>().notNull().default("contact"),
    /** Minor units. Kept when the price is hidden; never serialized publicly then. */
    priceAmount: bigint("price_amount", { mode: "number" }),
    currency: text("currency").$type<Currency>().notNull().default("IDR"),
    showPrice: boolean("show_price").notNull().default(false),
    ctaType: text("cta_type").$type<CtaType>().notNull().default("discuss"),

    isPublished: boolean("is_published").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(true),
    isComingSoon: boolean("is_coming_soon").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("ai_services_slug_idx").on(t.slug),
    index("ai_services_public_idx").on(t.isPublished, t.isPublic, t.archivedAt, t.displayOrder),
  ],
);

/** A visitor asking about a service. Reviewed by the Owner; never creates a contract or money. */
export const serviceInquiries = pgTable(
  "service_inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id").references(() => aiServices.id, { onDelete: "set null" }),
    /** Slug at submission time, kept readable if the service is renamed or removed. */
    serviceSlug: text("service_slug"),
    name: text("name").notNull(),
    company: text("company").notNull().default(""),
    email: text("email").notNull(),
    whatsapp: text("whatsapp").notNull().default(""),
    message: text("message").notNull(),
    consent: boolean("consent").notNull(),
    locale: text("locale").notNull().default("en"),
    status: text("status").$type<InquiryStatus>().notNull().default("new"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** Salted hash of the requester IP for abuse limits; the raw address is never stored. */
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("service_inquiries_status_idx").on(t.status, t.createdAt.desc())],
);
