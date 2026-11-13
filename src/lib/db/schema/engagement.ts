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
  MeetingItemClass,
  MeetingMatchType,
  MeetingNoteStatus,
  MeetingVisibility,
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
    /** Also send this reminder to the client by WhatsApp (to the client's phone number). */
    whatsapp: boolean("whatsapp").notNull().default(false),
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

/**
 * Notes from a meeting, written by the team or by the client. A client note waits for team
 * review before the agent reads it. Nothing here changes the plan: analysis only proposes.
 */
export const meetingNotes = pgTable(
  "meeting_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    authorId: userRef("author_id"),
    side: text("side").$type<"client" | "team">().notNull(),
    title: text("title").notNull(),
    meetingDate: date("meeting_date", { mode: "string" }).notNull(),
    attendees: text("attendees").notNull().default(""),
    body: text("body").notNull(),
    visibility: text("visibility").$type<MeetingVisibility>().notNull().default("internal"),
    status: text("status").$type<MeetingNoteStatus>().notNull().default("ready"),
    reviewedBy: userRef("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    clientConfirmedBy: userRef("client_confirmed_by"),
    clientConfirmedAt: timestamp("client_confirmed_at", { withTimezone: true }),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    /** Short code of the last failed analysis; cleared on success. */
    analysisError: text("analysis_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meeting_notes_project_idx").on(t.projectId, t.status, t.createdAt.desc())],
);
