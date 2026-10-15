import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AgentPermission, DocLinkState } from "@/lib/domain/enums";
import { users } from "./auth";
import { projects } from "./projects";
import { agents, documents } from "./workspace";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const projectRef = () =>
  uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

/**
 * One row per document that takes part in repository sync. Hashes are of normalized content,
 * so line-ending noise never counts as a change.
 */
export const documentLinks = pgTable(
  "document_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    documentId: uuid("document_id")
      .notNull()
      .unique()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Path inside the repository, e.g. "docs/PRD.md". */
    path: text("path").notNull(),
    /** Hash of the file as last seen on the base branch. */
    remoteHash: text("remote_hash"),
    /** Hash of what Saqina last sent to the sync branch (a pull request may still be open). */
    pushedHash: text("pushed_hash"),
    state: text("state").$type<DocLinkState>().notNull().default("synced"),
    /** The repository's side of a conflict, kept so the person can compare and decide. */
    conflictRemote: text("conflict_remote"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("document_links_project_idx").on(t.projectId)],
);

/**
 * The dirty flag: a trigger on `documents` upserts a row when a synced project's document
 * changes, so no write path can be missed and nothing is lost between commit and the sync run.
 */
export const projectSyncRequests = pgTable("project_sync_requests", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
});

/** GitHub delivery ids already handled: a replayed webhook is acknowledged and ignored. */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Bearer tokens for the inbound MCP server. Only the hash is stored; the token is shown once. */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** First characters of the token: shown in lists and logs, never enough to use it. */
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().$type<AgentPermission[]>().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("agent_tokens_project_idx").on(t.projectId)],
);
