import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AgentPermission,
  AiOperation,
  ConnectionStatus,
  CredentialKind,
  CredentialScope,
  GitProvider,
  HandoffFormat,
  HandoffStatus,
  McpAuthType,
  McpServerType,
  ModelCapability,
  ModelStatus,
  ProviderAdapterId,
  ProviderType,
  ToolExecutionStatus,
  ToolRisk,
  ToolSource,
  ToolTrust,
} from "@/lib/domain/enums";
import { agentRuns } from "./assistant";
import { users } from "./auth";
import { projects } from "./projects";
import { agents, tasks } from "./workspace";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" });
const optionalProject = () =>
  uuid("project_id").references(() => projects.id, { onDelete: "cascade" });
const projectRef = () =>
  uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

/**
 * Encrypted secrets (AES-256-GCM). Only `lib/secrets` decrypts; every other table points
 * here by id, so no API key or token ever sits in a regular column.
 */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").$type<CredentialScope>().notNull(),
    projectId: optionalProject(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CredentialKind>().notNull(),
    label: text("label").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyId: smallint("key_id").notNull().default(1),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestCode: text("last_test_code"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("credentials_scope_idx").on(t.scope, t.projectId)],
);

export const aiProviders = pgTable("ai_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").$type<ProviderType>().notNull(),
  adapter: text("adapter").$type<ProviderAdapterId>().notNull(),
  baseUrl: text("base_url"),
  status: text("status").$type<ConnectionStatus>().notNull().default("untested"),
  enabled: boolean("enabled").notNull().default(true),
  credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
  /** Non-secret adapter settings (API version, headers names). */
  configuration: jsonb("configuration").$type<Record<string, string>>().notNull().default({}),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const aiModels = pgTable(
  "ai_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    displayName: text("display_name").notNull(),
    capabilities: jsonb("capabilities").$type<ModelCapability[]>().notNull().default([]),
    contextWindow: integer("context_window"),
    status: text("status").$type<ModelStatus>().notNull().default("available"),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("ai_models_provider_model_idx").on(t.providerId, t.modelId)],
);

export interface ModelPolicy {
  allowedProviderIds: string[] | null;
  allowedModelIds: string[] | null;
  allowProjectOverride: boolean;
  allowAgentOverride: boolean;
  allowExternalProviders: boolean;
}

/** One row (id = 1): platform defaults and policy. */
export const platformAiSettings = pgTable("platform_ai_settings", {
  id: smallint("id").primaryKey().default(1),
  defaultModelId: uuid("default_model_id").references(() => aiModels.id, { onDelete: "set null" }),
  fallbackModelId: uuid("fallback_model_id").references(() => aiModels.id, {
    onDelete: "set null",
  }),
  policy: jsonb("policy").$type<ModelPolicy>().notNull(),
  updatedBy: userRef("updated_by"),
  updatedAt: updatedAt(),
});

/** Platform mappings key on agent role; project mappings key on a specific agent. */
export const agentModelMappings = pgTable(
  "agent_model_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").$type<"platform" | "project">().notNull(),
    agentRole: text("agent_role"),
    projectId: optionalProject(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    primaryModelId: uuid("primary_model_id")
      .notNull()
      .references(() => aiModels.id, { onDelete: "cascade" }),
    fallbackModelId: uuid("fallback_model_id").references(() => aiModels.id, {
      onDelete: "set null",
    }),
    requiredCapabilities: jsonb("required_capabilities")
      .$type<ModelCapability[]>()
      .notNull()
      .default([]),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("mappings_platform_role_idx").on(t.scope, t.agentRole),
    uniqueIndex("mappings_project_agent_idx").on(t.agentId),
  ],
);

export const aiUsageRecords = pgTable(
  "ai_usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: optionalProject(),
    providerId: uuid("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    modelId: uuid("model_id").references(() => aiModels.id, { onDelete: "set null" }),
    requestedModelId: uuid("requested_model_id"),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    operation: text("operation").$type<AiOperation>().notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms").notNull(),
    status: text("status").$type<"succeeded" | "failed">().notNull(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_project_idx").on(t.projectId, t.createdAt.desc())],
);

/** Infrastructure changes (providers, models, policy, connections). Metadata is redacted. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: userRef("actor_id"),
    scope: text("scope").$type<"platform" | "project">().notNull(),
    projectId: optionalProject(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_scope_idx").on(t.scope, t.projectId, t.createdAt.desc())],
);

export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    name: text("name").notNull(),
    serverType: text("server_type").$type<McpServerType>().notNull(),
    endpoint: text("endpoint").notNull(),
    transport: text("transport").$type<"streamable_http">().notNull().default("streamable_http"),
    authType: text("auth_type").$type<McpAuthType>().notNull().default("none"),
    /** Header name for `header` auth; the value is a credential. */
    authHeader: text("auth_header"),
    credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
    status: text("status").$type<ConnectionStatus>().notNull().default("untested"),
    lastError: text("last_error"),
    serverInfo: jsonb("server_info").$type<Record<string, string>>().notNull().default({}),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("mcp_project_name_idx").on(t.projectId, t.name)],
);

/** Normalised tools from every source. The orchestrator only ever sees this shape. */
export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    source: text("source").$type<ToolSource>().notNull(),
    connectionId: uuid("connection_id").references(() => mcpConnections.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** `source:connection:name`, unique per project (nullable columns cannot be unique keys). */
    key: text("key").notNull(),
    description: text("description").notNull().default(""),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>().notNull().default({}),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>(),
    riskLevel: text("risk_level").$type<ToolRisk>().notNull().default("medium"),
    trust: text("trust").$type<ToolTrust>().notNull().default("discovered"),
    /** Permission an agent needs; null means members only. */
    agentPermission: text("agent_permission").$type<AgentPermission>(),
    schemaHash: text("schema_hash").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tools_project_key_idx").on(t.projectId, t.key)],
);

export const toolExecutions = pgTable(
  "tool_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    toolId: uuid("tool_id").references(() => tools.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    source: text("source").$type<ToolSource>().notNull(),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    actorId: userRef("actor_id"),
    proposalId: uuid("proposal_id"),
    status: text("status").$type<ToolExecutionStatus>().notNull(),
    riskLevel: text("risk_level").$type<ToolRisk>().notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    durationMs: integer("duration_ms"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [index("tool_exec_project_idx").on(t.projectId, t.createdAt.desc())],
);

export const agentHandoffs = pgTable(
  "agent_handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: projectRef(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    contextVersion: integer("context_version").notNull(),
    contextHash: text("context_hash").notNull(),
    sourceRevision: text("source_revision"),
    format: text("format").$type<HandoffFormat>().notNull().default("markdown"),
    files: jsonb("files").$type<string[]>().notNull().default([]),
    /** Exactly what was handed over (secrets already scrubbed), so it can be compared later. */
    package: text("package").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    status: text("status").$type<HandoffStatus>().notNull().default("generated"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("handoffs_project_idx").on(t.projectId, t.createdAt.desc())],
);

export const repositoryConnections = pgTable("repository_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").$type<GitProvider>().notNull(),
  /** owner/name for hosted providers; an absolute path for custom_local (dev only). */
  fullName: text("full_name").notNull(),
  externalId: text("external_id"),
  baseUrl: text("base_url"),
  defaultBranch: text("default_branch").notNull().default("main"),
  developmentBranch: text("development_branch"),
  agentBranchPrefix: text("agent_branch_prefix").notNull().default("saqina/"),
  credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
  status: text("status").$type<ConnectionStatus>().notNull().default("untested"),
  headSha: text("head_sha"),
  detectedStack: jsonb("detected_stack").$type<Record<string, string>>().notNull().default({}),
  lastError: text("last_error"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdBy: userRef("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
