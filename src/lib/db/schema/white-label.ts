import { sql } from "drizzle-orm";
import {
  customType,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { WhiteLabelBasis } from "@/lib/white-label/policy";
import { users } from "./auth";
import { organizations } from "./organizations";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/**
 * Who may use white label. Locked unless a row here is open (see lib/white-label/policy). Only
 * the platform owner writes it, after a paid plan or a signed agreement; each row keeps what
 * opened it, so the lock can always be explained.
 */
export const whiteLabelGrants = pgTable(
  "white_label_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    basis: text("basis").$type<WhiteLabelBasis>().notNull(),
    /** The plan code or the agreement's reference number. */
    reference: text("reference").notNull(),
    note: text("note").notNull().default(""),
    /** Calendar date (YYYY-MM-DD); null for no end date. */
    validUntil: text("valid_until"),
    grantedBy: text("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("white_label_grants_org_idx").on(t.organizationId),
    // One open grant per organization: a new one replaces the old.
    uniqueIndex("white_label_grants_open_idx")
      .on(t.organizationId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

/**
 * How one organization presents itself to its clients. Read only while white label is open (see
 * lib/white-label/brand); when it closes the row stays and the default Saqina look returns. The
 * logo is a small PNG or JPEG kept on the row, so it is removed with the organization and needs
 * no file store.
 */
export const orgBrand = pgTable("org_brand", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Name shown to clients in place of Saqina. */
  brandName: text("brand_name"),
  /** Legal name, tax number and address printed as the issuer of invoices and receipts. */
  legalName: text("legal_name"),
  taxNumber: text("tax_number"),
  address: text("address"),
  /** #rrggbb, contrast-checked before it is saved. */
  accentColor: text("accent_color"),
  logoData: bytea("logo_data"),
  logoMime: text("logo_mime"),
  emailFromName: text("email_from_name"),
  replyTo: text("reply_to"),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
