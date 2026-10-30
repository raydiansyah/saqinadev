import { sql } from "drizzle-orm";
import {
  check,
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
import type { AgentPermission } from "@/lib/domain/enums";
import type {
  AgentDefinitionRole,
  AgentDefinitionStatus,
  AgentMessageStatus,
  AgentMessageType,
  ExecutionArtifactKind,
  ExecutionBudget,
  ExecutionJobKind,
  ExecutionJobStatus,
  ExecutionMode,
  ExecutionStatus,
} from "@/lib/domain/executions";
import { users } from "./auth";
import { aiModels } from "./platform";
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
const list = (name: string) => jsonb(name).$type<string[]>().notNull().default([]);

/**
 * A kind of agent, defined once for the platform by an Owner: who it is, what it may do, which
 * model and tools it uses. A project's `agents` row points here; an execution freezes a copy.
 */
export const agentDefinitions = pgTable(
  "agent_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable handle (`backend-developer`). Other definitions name their handoff targets by it. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<AgentDefinitionRole>().notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    responsibilities: list("responsibilities"),
    allowedScope: list("allowed_scope"),
    forbidden: list("forbidden"),
    inputRequirements: text("input_requirements").notNull().default(""),
    expectedOutput: text("expected_output").notNull().default(""),
    definitionOfDone: list("definition_of_done"),
    /** Null: the role's model mapping in the AI control plane decides. */
    modelId: uuid("model_id").references(() => aiModels.id, { onDelete: "set null" }),
    /** Tool keys the agent may call. Nothing outside this list runs. */
    tools: list("tools"),
    permissions: jsonb("permissions").$type<AgentPermission[]>().notNull().default([]),
    skills: list("skills"),
    /** Keys of the definitions this agent may hand work to. */
    handoffTargets: list("handoff_targets"),
    maxAttempts: integer("max_attempts").notNull().default(3),
    timeoutMs: integer("timeout_ms").notNull().default(300_000),
    priority: integer("priority").notNull().default(0),
    status: text("status").$type<AgentDefinitionStatus>().notNull().default("active"),
    version: integer("version").notNull().default(1),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("agent_definitions_key_idx").on(t.key)],
);

/** Every saved version of a definition, in full, so a past execution can be explained. */
export const agentDefinitionVersions = pgTable(
  "agent_definition_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => agentDefinitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    changedFields: list("changed_fields"),
    changedBy: userRef("changed_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_definition_versions_idx").on(t.definitionId, t.version)],
);

/** One request to plan or build, from the message to the finished work. The Studio reads only this. */
export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    conversationId: uuid("conversation_id"),
    messageId: uuid("message_id"),
    mode: text("mode").$type<ExecutionMode>().notNull(),
    request: text("request").notNull(),
    status: text("status").$type<ExecutionStatus>().notNull().default("queued"),
    /** Goal, risks and notes from the planner, for the Plan tab. */
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull().default({}),
    planVersion: integer("plan_version").notNull().default(1),
    /** The work branch the agents commit to, and the commit it started from. */
    branch: text("branch"),
    baseSha: text("base_sha"),
    /** Definitions as they were when the execution began: a later edit never changes a running one. */
    agentSnapshot: jsonb("agent_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    budget: jsonb("budget").$type<ExecutionBudget>().notNull(),
    /** Last event number given out; the next event is seq + 1. */
    seq: integer("seq").notNull().default(0),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("executions_project_idx").on(t.projectId, t.createdAt.desc()),
    index("executions_status_idx").on(t.status),
  ],
);

/** `taskId` waits for `dependsOnId`. A task never depends on itself; cycles are refused in the service. */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    index("task_dependencies_on_idx").on(t.dependsOnId),
    check("task_dependencies_not_self", sql`${t.taskId} <> ${t.dependsOnId}`),
  ],
);

/** What one agent tells another (or the orchestrator). The Agent Activity panel reads this. */
export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    /** Null: the orchestrator wrote it. */
    fromAgentId: uuid("from_agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** Null: the orchestrator, or everyone in the execution. */
    toAgentId: uuid("to_agent_id").references(() => agents.id, { onDelete: "set null" }),
    type: text("type").$type<AgentMessageType>().notNull(),
    body: text("body").notNull(),
    artifactRefs: jsonb("artifact_refs").$type<string[]>().notNull().default([]),
    status: text("status").$type<AgentMessageStatus>().notNull().default("sent"),
    /** The message this one answers or follows from. */
    replyToId: uuid("reply_to_id"),
    /** The same fact sent twice is stored once. */
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agent_messages_key_idx").on(t.executionId, t.idempotencyKey),
    index("agent_messages_execution_idx").on(t.executionId, t.createdAt),
  ],
);

/** The ordered log of everything that happened in an execution. State is rebuilt from it after a reconnect. */
export const executionEvents = pgTable(
  "execution_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("execution_events_seq_idx").on(t.executionId, t.seq)],
);

/** What an agent produced: a commit, a changed file, a test result, a decision, a report. */
export const executionArtifacts = pgTable(
  "execution_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    runId: uuid("run_id"),
    kind: text("kind").$type<ExecutionArtifactKind>().notNull(),
    path: text("path"),
    commitSha: text("commit_sha"),
    summary: text("summary").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("execution_artifacts_execution_idx").on(t.executionId, t.createdAt)],
);

/** Work for the worker: plan an execution, dispatch ready tasks, run one task. */
export const executionJobs = pgTable(
  "execution_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ExecutionJobKind>().notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    /** Asking twice for the same step queues one job. */
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<ExecutionJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("execution_jobs_key_idx").on(t.executionId, t.idempotencyKey),
    index("execution_jobs_due_idx").on(t.status, t.runAfter),
  ],
);
