import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { memoryAssets } from "./memory";
import { projects } from "./projects";

export type CodeIndexStatus = "indexing" | "ready" | "failed";
export type CodeFileStatus = "pending" | "parsed" | "skipped" | "failed";
export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "enum"
  | "variable";
export type ImportKind = "named" | "default" | "namespace" | "side_effect" | "reexport";
export type CallResolution = "resolved" | "name_only";
export interface ImportBinding {
  imported: string;
  local: string;
}

/**
 * What was read from a repository branch, and at which revision. The registry row (`asset_id`)
 * carries access like every asset; the code itself is never copied: only names, places and
 * relationships are kept.
 */
export const codeIndexes = pgTable(
  "code_indexes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .unique()
      .references(() => memoryAssets.id, { onDelete: "cascade" }),
    branch: text("branch").notNull(),
    /** The commit the tree was read at. Everything below belongs to this revision. */
    commitSha: text("commit_sha").notNull(),
    status: text("status").$type<CodeIndexStatus>().notNull().default("indexing"),
    /** Parser and its version, so an index from an older parser can be told apart. */
    parser: text("parser").notNull(),
    fileCount: integer("file_count").notNull().default(0),
    symbolCount: integer("symbol_count").notNull().default(0),
    /** Import aliases read from the repository's tsconfig, e.g. {"@/": "src/"}. */
    aliases: jsonb("aliases").$type<Record<string, string>>().notNull().default({}),
    errorCode: text("error_code"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("code_indexes_branch_idx").on(t.projectId, t.branch),
    check("code_indexes_status_check", sql`${t.status} in ('indexing','ready','failed')`),
  ],
);

export const codeFiles = pgTable(
  "code_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indexId: uuid("index_id")
      .notNull()
      .references(() => codeIndexes.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: text("language").notNull(),
    /** The host's id of this file's content. Same id means the file is not read again. */
    blobSha: text("blob_sha").notNull(),
    size: integer("size").notNull().default(0),
    isTest: boolean("is_test").notNull().default(false),
    status: text("status").$type<CodeFileStatus>().notNull().default("pending"),
    /** Why a file was skipped or failed (a code, never text from the file). */
    reason: text("reason"),
    lineCount: integer("line_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("code_files_path_idx").on(t.indexId, t.path),
    index("code_files_status_idx").on(t.indexId, t.status),
    check("code_files_status_check", sql`${t.status} in ('pending','parsed','skipped','failed')`),
  ],
);

export const codeSymbols = pgTable(
  "code_symbols",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indexId: uuid("index_id")
      .notNull()
      .references(() => codeIndexes.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<SymbolKind>().notNull(),
    exported: boolean("exported").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    /** The class a method belongs to. */
    parentId: uuid("parent_id"),
  },
  (t) => [
    index("code_symbols_name_idx").on(t.indexId, t.name),
    index("code_symbols_file_idx").on(t.fileId),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "code_symbols_parent_fk",
    }).onDelete("set null"),
  ],
);

export const codeImports = pgTable(
  "code_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    specifier: text("specifier").notNull(),
    kind: text("kind").$type<ImportKind>().notNull(),
    bindings: jsonb("bindings").$type<ImportBinding[]>().notNull().default([]),
    /** The file in this index the specifier points at; null for packages and what is not found. */
    resolvedFileId: uuid("resolved_file_id").references(() => codeFiles.id, {
      onDelete: "set null",
    }),
    line: integer("line").notNull(),
  },
  (t) => [
    index("code_imports_file_idx").on(t.fileId),
    index("code_imports_target_idx").on(t.resolvedFileId),
  ],
);

export const codeCalls = pgTable(
  "code_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    /** The function or method the call is in; null at module level. */
    callerSymbolId: uuid("caller_symbol_id").references(() => codeSymbols.id, {
      onDelete: "set null",
    }),
    calleeName: text("callee_name").notNull(),
    qualifier: text("qualifier"),
    line: integer("line").notNull(),
    resolvedSymbolId: uuid("resolved_symbol_id").references(() => codeSymbols.id, {
      onDelete: "set null",
    }),
    /** "resolved" when syntax and imports point at one symbol; "name_only" when only the name matches. */
    resolution: text("resolution").$type<CallResolution>().notNull().default("name_only"),
  },
  (t) => [
    index("code_calls_target_idx").on(t.resolvedSymbolId),
    // By file as well: a lookup by name inside one index reads that index's rows, not every project's.
    index("code_calls_name_idx").on(t.calleeName, t.fileId),
    index("code_calls_file_idx").on(t.fileId),
    check("code_calls_resolution_check", sql`${t.resolution} in ('resolved','name_only')`),
  ],
);
