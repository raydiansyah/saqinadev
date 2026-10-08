import { sql } from "drizzle-orm";
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
import type {
  AssignmentStatus,
  ConversationContext,
  MessageRole,
  MessageStatus,
  Priority,
  RunStatus,
} from "@/lib/domain/enums";
import { users } from "./auth";
import { projects } from "./projects";
import { agents, tasks } from "./workspace";

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

/** One thread with Saqina, private to the member who started it. */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contextType: text("context_type").$type<ConversationContext>().notNull().default("project"),
    contextId: text("context_id"),
    /** Compressed history for long threads (deterministic in Phase 3). */
    summary: text("summary"),
    summaryUpdatedAt: timestamp("summary_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_project_user_idx").on(t.projectId, t.userId, t.updatedAt.desc())],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Client-generated id for user messages; a resend with the same id is ignored. */
    clientId: uuid("client_id"),
    role: text("role").$type<MessageRole>().notNull(),
    content: text("content").notNull().default(""),
    status: text("status").$type<MessageStatus>().notNull().default("completed"),
    /** Structured blocks, intent and trace. Validated by `assistant/blocks.ts` on write. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_client_idx").on(t.conversationId, t.clientId),
  ],
);

export const agentAssignments = pgTable(
  "agent_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: text("status").$type<AssignmentStatus>().notNull().default("queued"),
    priority: text("priority").$type<Priority>().notNull().default("medium"),
    instructions: text("instructions").notNull().default(""),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("assignments_project_idx").on(t.projectId, t.status),
    // One open assignment per task: retries reuse it instead of piling up duplicates.
    uniqueIndex("assignments_open_task_idx")
      .on(t.taskId)
      .where(sql`${t.status} not in ('completed', 'failed', 'cancelled')`),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id").references(() => agentAssignments.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id"),
    proposalId: uuid("proposal_id"),
    attempt: integer("attempt").notNull().default(1),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("runs_project_idx").on(t.projectId, t.createdAt.desc()),
    index("runs_assignment_idx").on(t.assignmentId),
  ],
);

/** Agent run timeline. Generic AGENT_* events a future visual layer can subscribe to. */
export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    projectId: projectRef(),
    type: text("type").notNull(),
    data: jsonb("data")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index("run_events_run_idx").on(t.runId, t.createdAt)],
);
