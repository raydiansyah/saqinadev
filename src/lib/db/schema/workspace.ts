import { sql } from "drizzle-orm";
import {
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
import type { ActivityType, DocumentStatus, DocumentType, VersionSource } from "@/lib/domain/enums";
import { users } from "./auth";
import { projects } from "./projects";

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
/** Actor columns survive user deletion as null so history stays readable. */
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" });

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    type: text("type").$type<DocumentType>().notNull(),
    title: text("title").notNull(),
    /** File-like name unique within the project, e.g. "prd" renders as PRD.md. */
    slug: text("slug").notNull(),
    content: text("content").notNull().default(""),
    version: integer("version").notNull().default(1),
    status: text("status").$type<DocumentStatus>().notNull().default("draft"),
    /** Shared on the client portal. Only approved documents may be shared. */
    clientVisible: boolean("client_visible").notNull().default(false),
    /** Issued only when both parties have signed: "PRP-2026-001". Null until then. */
    reference: text("reference"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdBy: userRef("created_by"),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("documents_project_slug_idx").on(t.projectId, t.slug),
    uniqueIndex("documents_project_reference_idx")
      .on(t.projectId, t.reference)
      .where(sql`${t.reference} is not null`),
  ],
);

/**
 * A party's signature on one exact version of a document. The hash is of the text that was
 * signed, so a signature can always be checked against the version it belongs to. Editing the
 * document, or taking it back from approval, removes the signatures it had.
 */
export const documentSignatures = pgTable(
  "document_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    party: text("party").$type<"team" | "client">().notNull(),
    signerId: userRef("signer_id"),
    /** Kept as written: the person may later be renamed or removed. */
    signerName: text("signer_name").notNull(),
    contentHash: text("content_hash").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("document_signatures_party_idx").on(t.documentId, t.version, t.party)],
);

/** Every saved revision. Enough for history and diffs later without redesigning documents. */
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    /** Null for versions written before sources were tracked. */
    source: text("source").$type<VersionSource>(),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("document_versions_doc_version_idx").on(t.documentId, t.version)],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    actorId: userRef("actor_id"),
    type: text("type").$type<ActivityType>().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activities_project_idx").on(t.projectId, t.createdAt.desc())],
);
