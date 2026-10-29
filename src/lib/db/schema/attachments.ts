import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { conversations, messages } from "./assistant";
import { users } from "./auth";
import { projects } from "./projects";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/**
 * Files attached to a chat message. The bytes live in S3 (private bucket, key without the file
 * name); `data` is only used by the database fallback for development and tests. A row without a
 * message is an upload that was never sent and is removed by housekeeping.
 */
export const chatAttachments = pgTable(
  "chat_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    kind: text("kind").$type<"text" | "image" | "pdf">().notNull(),
    storage: text("storage").$type<"s3" | "db">().notNull(),
    storageKey: text("storage_key").notNull(),
    /** The text of a text file, for the prompt. */
    textContent: text("text_content"),
    data: bytea("data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("chat_attachments_message_idx").on(t.projectId, t.messageId),
    index("chat_attachments_unsent_idx").on(t.createdAt).where(sql`${t.messageId} is null`),
    check("chat_attachments_kind_check", sql`${t.kind} in ('text','image','pdf')`),
    check("chat_attachments_storage_check", sql`${t.storage} in ('s3','db')`),
  ],
);
