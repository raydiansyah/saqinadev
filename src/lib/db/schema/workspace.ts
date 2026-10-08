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
  ActivityType,
  AgentStatus,
  AgentType,
  AnswerSource,
  Confidence,
  DecisionStatus,
  DocumentStatus,
  DocumentType,
  MemoryCategory,
  MemorySource,
  Priority,
  ProposalStatus,
  RecommendationKey,
  RecommendationSource,
  RequirementGroup,
  RequirementStatus,
  TaskSource,
  TaskStatus,
} from "@/lib/domain/enums";
import { users } from "./auth";
import { projects } from "./projects";

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
/** Actor columns survive user deletion as null so history stays readable. */
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" });

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    group: text("group").$type<RequirementGroup>().notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priority: text("priority").$type<Priority>().notNull().default("medium"),
    status: text("status").$type<RequirementStatus>().notNull(),
    source: text("source").$type<AnswerSource>().notNull(),
    confidence: text("confidence").$type<Confidence>().notNull().default("high"),
    position: integer("position").notNull().default(0),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("requirements_project_idx").on(t.projectId, t.group, t.position)],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    key: text("key").$type<RecommendationKey>().notNull(),
    /** `{ label, detail? }` for simple items; landing stores concept ids. */
    value: jsonb("value").$type<{ label: string; detail?: string; ids?: string[] }>().notNull(),
    reason: text("reason").notNull(),
    confidence: text("confidence").$type<Confidence>().notNull(),
    source: text("source").$type<RecommendationSource>().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("recommendations_project_key_idx").on(t.projectId, t.key)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    type: text("type").$type<DocumentType>().notNull(),
    title: text("title").notNull(),
    /** File-like name unique within the project, e.g. "prd" renders as PRD.md. */
    slug: text("slug").notNull(),
    content: text("content").notNull().default(""),
    version: integer("version").notNull().default(1),
    status: text("status").$type<DocumentStatus>().notNull().default("draft"),
    createdBy: userRef("created_by"),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("documents_project_slug_idx").on(t.projectId, t.slug)],
);

/** Every saved revision. Enough for history and diffs later without redesigning documents. */
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("document_versions_doc_version_idx").on(t.documentId, t.version)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    title: text("title").notNull(),
    goal: text("goal").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId, t.position)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    priority: text("priority").$type<Priority>().notNull().default("medium"),
    assigneeId: userRef("assignee_id"),
    source: text("source").$type<TaskSource>().notNull().default("user"),
    phase: text("phase"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("tasks_project_idx").on(t.projectId, t.status, t.position)],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").$type<MemoryCategory>().notNull(),
    importance: text("importance").$type<"high" | "normal">().notNull().default("normal"),
    source: text("source").$type<MemorySource>().notNull(),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("memories_project_idx").on(t.projectId, t.createdAt.desc())],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    /** Sequential per project, shown as #001. */
    number: integer("number").notNull(),
    question: text("question").notNull(),
    context: text("context").notNull().default(""),
    options: jsonb("options").$type<string[]>().notNull(),
    selected: text("selected").notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<DecisionStatus>().notNull().default("accepted"),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("decisions_project_number_idx").on(t.projectId, t.number)],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    name: text("name").notNull(),
    type: text("type").$type<AgentType>().notNull(),
    provider: text("provider").notNull(),
    status: text("status").$type<AgentStatus>().notNull().default("available"),
    /** Non-secret settings only. Credentials will live in a separate encrypted store. */
    configuration: jsonb("configuration").$type<Record<string, string>>().notNull().default({}),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("agents_project_type_idx").on(t.projectId, t.type)],
);

/** Future human-approval queue for agent changes. Modelled now, not executed in Phase 2. */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<ProposalStatus>().notNull().default("pending"),
    createdBy: userRef("created_by"),
    reviewedBy: userRef("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("proposals_project_idx").on(t.projectId, t.status)],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    actorId: userRef("actor_id"),
    type: text("type").$type<ActivityType>().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activities_project_idx").on(t.projectId, t.createdAt.desc())],
);
