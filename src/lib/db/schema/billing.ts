import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Currency,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  ScopeCategory,
} from "@/lib/domain/business";
import { users } from "./auth";
import { clients, organizations } from "./organizations";
import { projects } from "./projects";
import { requirements } from "./workspace";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const projectRef = () =>
  uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" });
/** Money is always an integer in the currency's minor unit (IDR has none, USD has cents). */
const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);

/** Features and the agreed scope: included, excluded, optional or future. */
export const scopeItems = pgTable(
  "scope_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").$type<ScopeCategory>().notNull(),
    requirementId: uuid("requirement_id").references(() => requirements.id, {
      onDelete: "set null",
    }),
    clientVisible: boolean("client_visible").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scope_items_project_idx").on(t.projectId, t.category, t.position)],
);

/** Payment schedule (DP, milestones, final). A term is locked once invoiced. */
export const paymentTerms = pgTable(
  "payment_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    label: text("label").notNull(),
    /** Basis points (4000 = 40%); null when the term was entered as a fixed amount. */
    percentBp: integer("percent_bp"),
    amount: money("amount"),
    dueDate: date("due_date", { mode: "string" }),
    position: integer("position").notNull().default(0),
    invoiceId: uuid("invoice_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payment_terms_project_idx").on(t.projectId, t.position)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: projectRef(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    termId: uuid("term_id").references(() => paymentTerms.id, { onDelete: "set null" }),
    /** Assigned when issued (INV-2026-001); drafts have none. */
    number: text("number"),
    title: text("title").notNull(),
    status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
    currency: text("currency").$type<Currency>().notNull(),
    issueDate: date("issue_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    total: money("total"),
    amountPaid: money("amount_paid"),
    notes: text("notes").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("invoices_org_number_idx").on(t.organizationId, t.number),
    index("invoices_project_idx").on(t.projectId, t.createdAt.desc()),
    index("invoices_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitAmount: money("unit_amount"),
    amount: money("amount"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId, t.position)],
);

/**
 * Money actually received. Never deleted: a mistaken entry is voided with a reason, so the
 * transaction history stays complete.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    projectId: projectRef(),
    amount: money("amount"),
    currency: text("currency").$type<Currency>().notNull(),
    paidAt: date("paid_at", { mode: "string" }).notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    reference: text("reference").notNull().default(""),
    status: text("status").$type<PaymentStatus>().notNull().default("confirmed"),
    recordedBy: userRef("recorded_by"),
    voidedBy: userRef("voided_by"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_project_idx").on(t.projectId, t.paidAt),
  ],
);

/** Sequential numbers per organization, kind and year, allocated under a row lock. */
export const orgCounters = pgTable(
  "org_counters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    year: integer("year").notNull(),
    next: integer("next").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.kind, t.year] })],
);
