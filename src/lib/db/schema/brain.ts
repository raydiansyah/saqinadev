import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("project_changes_revision_idx").on(t.projectId, t.revision),
    index("project_changes_pending_idx").on(t.projectId, t.createdAt),
  ],
);
