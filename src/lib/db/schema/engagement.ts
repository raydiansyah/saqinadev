import {
  bigint,
  boolean,
  date,
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
  ApprovalStatus,
  ChangeRequestStatus,
  Currency,
  MaintenanceClass,
  MaintenanceCycle,
  MaintenanceStatus,
  NotificationChannel,
  ReminderAudience,
  ReminderKind,
  RequestKind,
  RequestStatus,
  ScopeStatus,
} from "@/lib/domain/business";
import { users } from "./auth";
import { clients, organizations } from "./organizations";
import { projects } from "./projects";
import { documents } from "./workspace";

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

/** In-app notifications. `dedupKey` makes repeated events (reminders, retries) land once. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    /** Rendered per reader locale from messages (`notifications.types.<type>`). */
    params: jsonb("params").$type<Record<string, string>>().notNull().default({}),
    href: text("href"),
    dedupKey: text("dedup_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_user_dedup_idx").on(t.userId, t.dedupKey),
    index("notifications_user_idx").on(t.userId, t.createdAt.desc()),
  ],
);

/** One row per channel attempt beyond in-app (email today; WhatsApp/Telegram later). */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: text("channel").$type<NotificationChannel>().notNull(),
    status: text("status").$type<"sent" | "failed" | "skipped">().notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("deliveries_notification_idx").on(t.notificationId)],
);

/** Reminder configuration per organization. Defaults are created on first use. */
export const reminderRules = pgTable(
  "reminder_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReminderKind>().notNull(),
    /** Days relative to the anchor date: negative = before (due in 3 days), positive = after. */
    offsetDays: integer("offset_days").notNull(),
    audience: text("audience").$type<ReminderAudience>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reminder_rules_unique_idx").on(t.organizationId, t.kind, t.offsetDays)],
);

/** Every reminder sent, unique per rule, entity and window so a cron re-run never repeats one. */
export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => reminderRules.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    windowKey: text("window_key").notNull(),
    recipients: integer("recipients").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reminder_log_unique_idx").on(t.ruleId, t.entityId, t.windowKey)],
);

/** Something a client asked for: a question, a feature, a bug or a maintenance request. */
export const clientRequests = pgTable(
  "client_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    authorId: userRef("author_id"),
    /** "client" when submitted on the portal, "team" when logged on the client's behalf. */
    side: text("side").$type<"client" | "team">().notNull(),
    kind: text("kind").$type<RequestKind>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status").$type<RequestStatus>().notNull().default("open"),
    scopeStatus: text("scope_status").$type<ScopeStatus>().notNull().default("unknown"),
    /** Maintenance requests only. The team decides; Saqina may suggest. */
    classification: text("classification")
      .$type<MaintenanceClass>()
      .notNull()
      .default("unclassified"),
    suggestedClassification: text("suggested_classification").$type<MaintenanceClass>(),
    changeRequestId: uuid("change_request_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("client_requests_project_idx").on(t.projectId, t.status, t.createdAt.desc())],
);

/** The client-facing message thread of a project. Internal notes never go here. */
export const projectMessages = pgTable(
  "project_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    authorId: userRef("author_id"),
    side: text("side").$type<"client" | "team">().notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("project_messages_project_idx").on(t.projectId, t.createdAt)],
);

/** Something the team asks the client to approve (a design, a document, a milestone). */
export const clientApprovals = pgTable(
  "client_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    link: text("link"),
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),
    requestedBy: userRef("requested_by"),
    respondedBy: userRef("responded_by"),
    responseNote: text("response_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("client_approvals_project_idx").on(t.projectId, t.status)],
);

/**
 * Work outside the agreed scope. Never charged or scheduled until the client approves it; on
 * approval it becomes scope, a task and a payment term.
 */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    /** Sequential per project, shown as CR-001. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    requestId: uuid("request_id"),
    scopeStatus: text("scope_status").$type<ScopeStatus>().notNull().default("unknown"),
    impact: text("impact").notNull().default(""),
    additionalCost: bigint("additional_cost", { mode: "number" }).notNull().default(0),
    currency: text("currency").$type<Currency>().notNull(),
    additionalDays: integer("additional_days").notNull().default(0),
    status: text("status").$type<ChangeRequestStatus>().notNull().default("draft"),
    createdBy: userRef("created_by"),
    decidedBy: userRef("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("change_requests_project_number_idx").on(t.projectId, t.number)],
);

/** Paid support after delivery. Warranty is a separate date on the project. */
export const maintenancePlans = pgTable(
  "maintenance_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    fee: bigint("fee", { mode: "number" }).notNull().default(0),
    currency: text("currency").$type<Currency>().notNull(),
    cycle: text("cycle").$type<MaintenanceCycle>().notNull(),
    scope: text("scope").notNull().default(""),
    excluded: text("excluded").notNull().default(""),
    responseHours: integer("response_hours"),
    status: text("status").$type<MaintenanceStatus>().notNull().default("active"),
    renewedFromId: uuid("renewed_from_id"),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("maintenance_plans_project_idx").on(t.projectId, t.endDate)],
);
