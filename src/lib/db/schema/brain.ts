import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { projects } from "./projects";

/**
 * Outbox of everything that changed what agents read about a project. One row per change, written
 * in the same transaction as the change itself (see `recordActivity`), so nothing that happens is
 * missed and nothing is processed twice. Readers ask "what changed since revision N" instead of
 * scanning the project again. `processedAt` marks the changes the memory journal, PRD check and
 * document map have already consumed.
 */
export const projectChanges = pgTable(
  "project_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The project's `contextRevision` right after this change. Strictly increasing per project. */
    revision: integer("revision").notNull(),
    /** Activity type, e.g. "task.completed". */
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** "human" | "ai" | "agent" | "import" | "system" when the caller says so; else null. */
    origin: text("origin"),
    /** The activity metadata (titles, slugs, counts); never content. */
    detail: jsonb("detail").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("project_changes_revision_idx").on(t.projectId, t.revision),
    index("project_changes_pending_idx").on(t.projectId, t.createdAt),
  ],
);

export const PRD_FINDING_KINDS = [
  "placeholder_section",
  "requirement_not_in_prd",
  "requirement_out_of_scope",
  "task_out_of_scope",
] as const;
export type PrdFindingKind = (typeof PRD_FINDING_KINDS)[number];

/**
 * Where the project and its PRD disagree. Rebuilt whenever the inputs change: a finding opens
 * when the disagreement appears and resolves by itself when it disappears. A dismissed finding
 * stays dismissed while the same disagreement persists.
 */
export const prdFindings = pgTable(
  "prd_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** kind + entity: the same disagreement always has the same fingerprint. */
    fingerprint: text("fingerprint").notNull(),
    kind: text("kind").$type<PrdFindingKind>().notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    subject: text("subject").notNull(),
    status: text("status").$type<"open" | "resolved" | "dismissed">().notNull().default("open"),
    openedAtRevision: integer("opened_at_revision").notNull(),
    lastSeenRevision: integer("last_seen_revision").notNull(),
    proposalId: uuid("proposal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedBy: text("dismissed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("prd_findings_fingerprint_idx").on(t.projectId, t.fingerprint),
    index("prd_findings_status_idx").on(t.projectId, t.status),
  ],
);

export const DOC_MAP_ROLES = [
  "prd",
  "plan",
  "tasks",
  "spec",
  "memory",
  "decision",
  "process",
  "client",
  "other",
] as const;
export type DocMapRole = (typeof DOC_MAP_ROLES)[number];

/**
 * The project's documents and what each one is for. The hash lets a sync skip everything that did
 * not change, so a repository with hundreds of files is read once, then only its changes.
 * `classifiedBy: "user"` is a person's correction and is never replaced by a later guess.
 */
export const docIndex = pgTable(
  "doc_index",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    role: text("role").$type<DocMapRole>().notNull(),
    classifiedBy: text("classified_by")
      .$type<"name" | "folder" | "content" | "ai" | "user">()
      .notNull(),
    confidence: integer("confidence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("doc_index_path_idx").on(t.projectId, t.path),
    index("doc_index_role_idx").on(t.projectId, t.role),
  ],
);
