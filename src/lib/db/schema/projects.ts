import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Currency } from "@/lib/domain/business";
import type {
  AnswerSource,
  ApprovalPolicy,
  BuildStrategy,
  DeployProvider,
  InterviewStatus,
  MemberRole,
  ProjectStatus,
  RepoProvider,
  StackKey,
  StackSource,
} from "@/lib/domain/enums";
import { users } from "./auth";
import { clients, organizations } from "./organizations";

/** `acknowledged` = a repository value the user already reviewed for this field. */
export type TechStack = Partial<
  Record<StackKey, { value: string; source: StackSource; acknowledged?: string }>
>;

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Public, URL-safe identifier. The uuid never appears in the UI. */
    slug: text("slug").notNull().unique(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** Project billing currency and agreed value (minor units). Not the Saqina subscription. */
    currency: text("currency").$type<Currency>().notNull().default("IDR"),
    value: bigint("value", { mode: "number" }),
    /** Whether the assigned client's portal users can see this project. */
    portalEnabled: boolean("portal_enabled").notNull().default(false),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Project type id from the interview options (pos, marketplace, ...). */
    type: text("type"),
    status: text("status").$type<ProjectStatus>().notNull().default("draft"),
    complexity: text("complexity").$type<"low" | "medium" | "high">(),
    platform: text("platform"),
    buildStrategy: text("build_strategy").$type<BuildStrategy>(),
    preferredAgent: text("preferred_agent"),
    /** Language the generated documents were written in. */
    locale: text("locale").notNull().default("en"),
    isDemo: boolean("is_demo").notNull().default(false),
    /** Bumped on every recorded change; agent context packages carry it as their version. */
    contextRevision: integer("context_revision").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("projects_owner_idx").on(t.ownerId, t.updatedAt.desc()),
    index("projects_org_idx").on(t.organizationId),
    index("projects_client_idx").on(t.clientId),
  ],
);

/** Membership is the access boundary; the owner is also a member with role "owner". */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("members_user_idx").on(t.userId)],
);

/** Preferences for future integrations. Stored only; nothing here connects to a service yet. */
export const projectSettings = pgTable("project_settings", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  repoProvider: text("repo_provider").$type<RepoProvider>(),
  repoUrl: text("repo_url"),
  defaultBranch: text("default_branch"),
  deployProvider: text("deploy_provider").$type<DeployProvider>(),
  environment: text("environment"),
  domain: text("domain"),
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),
  /** Whether low-risk assistant writes run immediately or always wait for approval. */
  /** Project model preferences, applied only when the platform policy allows it. */
  preferredModelId: uuid("preferred_model_id"),
  allowAgentOverrides: boolean("allow_agent_overrides").notNull().default(true),
  allowedModelIds: jsonb("allowed_model_ids").$type<string[] | null>(),
  techStack: jsonb("tech_stack").$type<TechStack>().notNull().default({}),
  approvalPolicy: text("approval_policy")
    .$type<ApprovalPolicy>()
    .notNull()
    .default("auto_low_risk"),
  updatedAt: updatedAt(),
});

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status").$type<InterviewStatus>().notNull().default("in_progress"),
    currentStep: text("current_step").notNull().default("project"),
    completedSteps: text("completed_steps").array().notNull().default(sql`'{}'::text[]`),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("interviews_project_idx").on(t.projectId)],
);

export const interviewAnswers = pgTable(
  "interview_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    /** Key of the answer field (projectType, features, details, ...). */
    questionKey: text("question_key").notNull(),
    answer: jsonb("answer").notNull(),
    answerType: text("answer_type").$type<"text" | "choice" | "multi" | "object">().notNull(),
    confidence: text("confidence").$type<"high" | "medium" | "low">().notNull().default("high"),
    source: text("source").$type<AnswerSource>().notNull().default("user"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("answers_interview_key_idx").on(t.interviewId, t.questionKey)],
);
