import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { WikiSourceStatus, WikiSourceType } from "@/lib/domain/memory";
import { memoryAssets } from "./memory";
import { projects } from "./projects";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * A text the wiki has read: a project document, or a document file of the connected repository.
 * One source is one wiki page (its registry row is `asset_id`). The content hash and version say
 * what was read, so an unchanged source is not read again and a changed one is noticed.
 */
export const wikiSources = pgTable(
  "wiki_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .unique()
      .references(() => memoryAssets.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<WikiSourceType>().notNull(),
    /** Document slug, or repository path. */
    sourceRef: text("source_ref").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    contentHash: text("content_hash").notNull(),
    /** Version of the project document when it was read (null for repository files). */
    sourceVersion: integer("source_version"),
    status: text("status").$type<WikiSourceStatus>().notNull().default("ready"),
    /** A code, never text from the source. */
    errorCode: text("error_code"),
    chunkCount: integer("chunk_count").notNull().default(0),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("wiki_sources_ref_idx").on(t.projectId, t.sourceType, t.sourceRef),
    check("wiki_sources_type_check", sql`${t.sourceType} in ('document','repo_file')`),
    check("wiki_sources_status_check", sql`${t.status} in ('ready','failed')`),
  ],
);

/** A passage of a source with the place it came from, so an answer can cite it exactly. */
export const wikiChunks = pgTable(
  "wiki_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => wikiSources.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    /** Heading path such as "Payments › Refunds"; empty before the first heading. */
    heading: text("heading").notNull().default(""),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    content: text("content").notNull(),
    search: tsvector("search").generatedAlwaysAs(
      sql`to_tsvector('simple', heading || ' ' || content)`,
    ),
  },
  (t) => [
    uniqueIndex("wiki_chunks_order_idx").on(t.sourceId, t.ordinal),
    index("wiki_chunks_search_idx").using("gin", t.search),
  ],
);

/** A link from one source to another (a Markdown link or [[slug]]), resolved when the target is known. */
export const wikiLinks = pgTable(
  "wiki_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => wikiSources.id, { onDelete: "cascade" }),
    targetRef: text("target_ref").notNull(),
    targetSourceId: uuid("target_source_id").references(() => wikiSources.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull().default(""),
  },
  (t) => [
    index("wiki_links_source_idx").on(t.sourceId),
    index("wiki_links_target_idx").on(t.targetSourceId),
  ],
);
