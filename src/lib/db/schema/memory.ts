import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
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
import type {
  AclPermission,
  AssetStatus,
  AssetType,
  BindingMode,
  BindingTarget,
  JobKind,
  JobStatus,
  MemoryConfidence,
  MemoryKind,
  MemoryLevel,
  PrincipalType,
  SourceType,
  Visibility,
} from "@/lib/domain/memory";
import { users } from "./auth";
import { organizations } from "./organizations";
import { projects } from "./projects";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" });
const projectRef = () =>
  uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

/** Read-only to the app: Postgres keeps it in step with `search_text` (generated column). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * The registry every knowledge asset goes through. Type-specific content lives next to it
 * (`memories` for chat assets); this row holds what authorization, lifecycle and retrieval need.
 */
export const memoryAssets = pgTable(
  "memory_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetType: text("asset_type").$type<AssetType>().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Null only for organization-wide assets. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    ownerId: userRef("owner_id"),
    visibility: text("visibility").$type<Visibility>().notNull().default("private"),
    status: text("status").$type<AssetStatus>().notNull().default("candidate"),
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    summary: text("summary"),
    /** Text the full-text index is built from (title + content). */
    searchText: text("search_text").notNull().default(""),
    search: tsvector("search").generatedAlwaysAs(sql`to_tsvector('simple', search_text)`),
    contentHash: text("content_hash").notNull(),
    /** Stable key of a fact that is updated in place instead of duplicated. */
    dedupeKey: text("dedupe_key"),
    supersedesId: uuid("supersedes_id"),
    /** Set when this asset disagrees with another one; resolved by a person, never by code. */
    conflictWithId: uuid("conflict_with_id"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("memory_assets_scope_idx").on(t.projectId, t.status, t.visibility),
    index("memory_assets_owner_idx").on(t.ownerId),
    index("memory_assets_search_idx").using("gin", t.search),
    uniqueIndex("memory_assets_dedupe_idx")
      .on(t.projectId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    // The vocabularies are text in the application; the database refuses anything outside them.
    check("memory_assets_type_check", sql`${t.assetType} in ('chat','skill','wiki','code')`),
    check(
      "memory_assets_visibility_check",
      sql`${t.visibility} in ('private','project','organization','restricted','agent')`,
    ),
    check(
      "memory_assets_status_check",
      sql`${t.status} in ('candidate','pending_review','approved','rejected','superseded','archived')`,
    ),
    // A pointer to another asset that is deleted is cleared, never left dangling.
    foreignKey({
      columns: [t.supersedesId],
      foreignColumns: [t.id],
      name: "memory_assets_supersedes_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.conflictWithId],
      foreignColumns: [t.id],
      name: "memory_assets_conflict_fk",
    }).onDelete("set null"),
  ],
);

/** Every edit or supersede keeps the old text, so history can be read and a mistake undone. */
export const memoryVersions = pgTable(
  "memory_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => memoryAssets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    editedBy: userRef("edited_by"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memory_versions_asset_idx").on(t.assetId, t.version)],
);

/** Citations: where an asset came from. Ids only; the content stays in its own record. */
export const memorySources = pgTable(
  "memory_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => memoryAssets.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<SourceType>().notNull(),
    sourceId: text("source_id").notNull(),
    /** Message range, section, file path or line, depending on the source type. */
    locator: jsonb("locator").$type<Record<string, string | number>>(),
    capturedAt: createdAt(),
  },
  (t) => [
    index("memory_sources_asset_idx").on(t.assetId),
    index("memory_sources_ref_idx").on(t.sourceType, t.sourceId),
  ],
);

/** Who may read or manage an asset whose visibility is "restricted" or "agent". */
export const memoryAcl = pgTable(
  "memory_acl",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => memoryAssets.id, { onDelete: "cascade" }),
    principalType: text("principal_type").$type<PrincipalType>().notNull(),
    principalId: text("principal_id").notNull(),
    permission: text("permission").$type<AclPermission>().notNull().default("read"),
    grantedBy: userRef("granted_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("memory_acl_principal_idx").on(t.assetId, t.principalType, t.principalId),
    index("memory_acl_lookup_idx").on(t.principalType, t.principalId),
  ],
);

/**
 * A loadout entry: which memory an agent (or role) receives. A binding only selects; access is
 * checked again at retrieval, so a binding never overrides a revoked permission.
 */
export const memoryBindings = pgTable(
  "memory_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    targetType: text("target_type").$type<BindingTarget>().notNull(),
    /** Agent id, agent role, or "assistant". */
    targetId: text("target_id").notNull(),
    /** One asset, or a selector of kind / level / category when null. */
    assetId: uuid("asset_id").references(() => memoryAssets.id, { onDelete: "cascade" }),
    selector: jsonb("selector").$type<{
      kind?: MemoryKind;
      level?: MemoryLevel;
      category?: string;
    }>(),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    mode: text("mode").$type<BindingMode>().notNull().default("always"),
    taskTypes: text("task_types").array(),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("memory_bindings_target_idx").on(t.projectId, t.targetType, t.targetId)],
);

/** Background work: extraction from chat, consolidation. Idempotent and bounded. */
export const memoryJobs = pgTable(
  "memory_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    kind: text("kind").$type<JobKind>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** Ids only (conversation, message range, owner); never message text. */
    input: jsonb("input").$type<Record<string, string | number>>().notNull(),
    /** A code such as "ai_unavailable"; never content. */
    errorCode: text("error_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memory_jobs_key_idx").on(t.idempotencyKey),
    index("memory_jobs_due_idx").on(t.status, t.runAfter),
    index("memory_jobs_project_idx").on(t.projectId, t.createdAt.desc()),
  ],
);

/** A deleted asset leaves only a hash of its key, so automatic re-ingestion cannot bring it back. */
export const memoryTombstones = pgTable(
  "memory_tombstones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    keyHash: text("key_hash").notNull(),
    deletedBy: userRef("deleted_by"),
    deletedAt: createdAt(),
  },
  (t) => [uniqueIndex("memory_tombstones_key_idx").on(t.projectId, t.keyHash)],
);

/** Retrieval telemetry. No query text, only its hash. Pruned by housekeeping. */
export const memoryRetrievals = pgTable(
  "memory_retrievals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    requesterKind: text("requester_kind").notNull(),
    agentId: uuid("agent_id"),
    queryHash: text("query_hash").notNull(),
    resultCount: integer("result_count").notNull(),
    assetIds: jsonb("asset_ids").$type<string[]>().notNull(),
    latencyMs: integer("latency_ms").notNull(),
    degraded: text("degraded"),
    createdAt: createdAt(),
  },
  (t) => [index("memory_retrievals_project_idx").on(t.projectId, t.createdAt.desc())],
);
