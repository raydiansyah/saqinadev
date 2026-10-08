/**
 * Domain vocabularies shared by the database schema, validators and UI. Stored as text in
 * Postgres (not native enums) so adding a value never needs a type migration.
 */

export const PROJECT_STATUSES = [
  "draft",
  "interview",
  "planning",
  "ready",
  "building",
  "review",
  "paused",
  "completed",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const BUILD_STRATEGIES = ["saqina", "external"] as const;
export type BuildStrategy = (typeof BUILD_STRATEGIES)[number];

export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const INTERVIEW_STATUSES = ["in_progress", "completed"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/** Where a piece of project knowledge came from. Inferred data is never treated as confirmed. */
export const ANSWER_SOURCES = [
  "user",
  "inferred",
  "imported",
  "system",
  "assistant",
  "agent",
] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export const REQUIREMENT_GROUPS = [
  "overview",
  "users_roles",
  "features",
  "business_rules",
  "integrations",
  "authentication",
  "data",
  "ux",
  "infrastructure",
  "constraints",
  "open_questions",
  "assumptions",
] as const;
export type RequirementGroup = (typeof REQUIREMENT_GROUPS)[number];

export const REQUIREMENT_STATUSES = ["confirmed", "inferred", "unknown", "conflicting"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const RECOMMENDATION_KEYS = [
  "application",
  "database",
  "deployment",
  "authentication",
  "architecture",
  "build_strategy",
  "landing",
] as const;
export type RecommendationKey = (typeof RECOMMENDATION_KEYS)[number];

export const RECOMMENDATION_SOURCES = ["recommended", "user"] as const;
export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

export const DOCUMENT_TYPES = [
  "prd",
  "plan",
  "memory",
  "decision",
  "notes",
  "requirements",
  "custom",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["draft", "review", "approved"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ["plan", "user", "agent", "assistant"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const MEMORY_CATEGORIES = [
  "architecture",
  "product",
  "design",
  "technical",
  "business",
  "user_preference",
  "decision",
  "constraint",
  "integration",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_SOURCES = [
  "interview",
  "recommendation",
  "user",
  "agent",
  "assistant",
] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const DECISION_STATUSES = ["proposed", "accepted", "superseded"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const AGENT_TYPES = [
  "saqina",
  "claude",
  "codex",
  "cursor",
  "kiro",
  "hermes",
  "antigravity",
  "openclaw",
  "custom",
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_STATUSES = [
  "available",
  "connected",
  "disconnected",
  "pending",
  "disabled",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
  "cancelled",
  "expired",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Meaningful project events only; UI clicks belong to analytics, not here. */
export const ACTIVITY_TYPES = [
  "project.created",
  "project.updated",
  "project.archived",
  "project.restored",
  "interview.started",
  "interview.completed",
  "requirement.created",
  "requirement.updated",
  "requirement.deleted",
  "recommendation.changed",
  "document.created",
  "document.updated",
  "task.created",
  "task.updated",
  "task.completed",
  "task.reopened",
  "task.deleted",
  "milestone.updated",
  "memory.created",
  "memory.updated",
  "decision.created",
  "decision.updated",
  "agent.updated",
  "agent.assigned",
  "agent.started",
  "agent.waiting",
  "agent.completed",
  "agent.failed",
  "agent.cancelled",
  "proposal.created",
  "proposal.approved",
  "proposal.rejected",
  "proposal.revision_requested",
  "proposal.cancelled",
  "settings.updated",
  "model.selected",
  "model.fallback_used",
  "mcp.connected",
  "mcp.disconnected",
  "tool.executed",
  "tool.trust_changed",
  "agent.connected",
  "agent.disconnected",
  "agent.handoff_created",
  "agent.result_imported",
  "repository.connected",
  "repository.disconnected",
  "branch.created",
  "commit.created",
  "pull_request.created",
  "stack.updated",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const REPO_PROVIDERS = ["github", "gitlab", "bitbucket", "custom"] as const;
export type RepoProvider = (typeof REPO_PROVIDERS)[number];

export const DEPLOY_PROVIDERS = ["vercel", "other", "self-hosted"] as const;
export type DeployProvider = (typeof DEPLOY_PROVIDERS)[number];

// ── Phase 3: assistant, proposals and agent orchestration ──────────────────────────────

/** What a conversation is anchored to. `project` means no specific entity. */
export const CONVERSATION_CONTEXTS = [
  "project",
  "task",
  "requirement",
  "decision",
  "document",
  "prd",
  "memory",
] as const;
export type ConversationContext = (typeof CONVERSATION_CONTEXTS)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** READ never mutates; DESTRUCTIVE, EXTERNAL and AGENT always need a human approval. */
export const ACTION_CATEGORIES = ["read", "write", "destructive", "external", "agent"] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const APPROVAL_POLICIES = ["auto_low_risk", "always"] as const;
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];

export const ASSIGNMENT_STATUSES = [
  "queued",
  "assigned",
  "running",
  "waiting",
  "blocked",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting",
  "blocked",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** What an agent can do (skills). Never implies it is allowed to do it. */
export const AGENT_CAPABILITIES = [
  "planning",
  "research",
  "frontend",
  "backend",
  "database",
  "testing",
  "security",
  "documentation",
  "code_review",
  "browser",
  "filesystem",
  "git",
] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

/** What an agent is allowed to touch in this project. Separate from capabilities. */
export const AGENT_PERMISSIONS = [
  "read_project",
  "read_prd",
  "read_tasks",
  "read_memory",
  "write_tasks",
  "write_memory",
  "write_documents",
  "write_requirements",
  "read_repository",
  "write_branch",
  "use_mcp_tools",
  "git_push",
  "deploy",
  "delete_project",
] as const;
export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

/** Default role agents every project gets (provider saqina, simulated execution in Phase 3). */
export const AGENT_ROLES = ["general", "planner", "frontend", "backend", "qa", "docs"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

// ── Phase 4: control plane, tools, MCP, external agents and Git ─────────────────────────

export const PLATFORM_ROLES = ["user", "owner"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const CREDENTIAL_SCOPES = ["platform", "project", "user"] as const;
export type CredentialScope = (typeof CREDENTIAL_SCOPES)[number];

export const CREDENTIAL_KINDS = ["ai_provider", "git", "mcp", "agent"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CONNECTION_STATUSES = [
  "connected",
  "disconnected",
  "error",
  "unauthorized",
  "expired",
  "disabled",
  "untested",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const PROVIDER_TYPES = ["managed", "custom", "gateway"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

/** Which adapter talks to the provider. New providers add an adapter, not a code path. */
export const PROVIDER_ADAPTERS = [
  "anthropic",
  "anthropic_compatible",
  "openai",
  "openai_compatible",
  "gemini",
  "vercel_gateway",
] as const;
export type ProviderAdapterId = (typeof PROVIDER_ADAPTERS)[number];

export const MODEL_STATUSES = [
  "available",
  "disabled",
  "unavailable",
  "configuration_error",
] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

/** Declared by the Owner per model; never guessed from the model name. */
export const MODEL_CAPABILITIES = [
  "text",
  "reasoning",
  "vision",
  "structured_output",
  "tool_calling",
  "streaming",
  "coding",
  "long_context",
] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const MODEL_SOURCES = [
  "agent_override",
  "project_override",
  "platform_default",
  "fallback",
] as const;
export type ModelSource = (typeof MODEL_SOURCES)[number];

export const AI_OPERATIONS = [
  "conversation",
  "intent",
  "structured_analysis",
  "document_generation",
  "agent_run",
  "tool_call",
  "context_generation",
  "connection_test",
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

export const TOOL_RISKS = ["low", "medium", "high", "critical"] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

export const TOOL_SOURCES = ["internal", "mcp", "git"] as const;
export type ToolSource = (typeof TOOL_SOURCES)[number];

/** New tools start as discovered and do nothing until someone enables them. */
export const TOOL_TRUST = ["discovered", "enabled", "disabled"] as const;
export type ToolTrust = (typeof TOOL_TRUST)[number];

export const TOOL_EXECUTION_STATUSES = [
  "pending_approval",
  "running",
  "succeeded",
  "failed",
  "denied",
] as const;
export type ToolExecutionStatus = (typeof TOOL_EXECUTION_STATUSES)[number];

export const MCP_SERVER_TYPES = ["remote", "local_dev", "custom", "managed"] as const;
export type McpServerType = (typeof MCP_SERVER_TYPES)[number];

export const MCP_AUTH_TYPES = ["none", "bearer", "header"] as const;
export type McpAuthType = (typeof MCP_AUTH_TYPES)[number];

export const AGENT_STRATEGIES = ["handoff", "manual", "webhook", "api", "cli", "mcp"] as const;
export type AgentStrategy = (typeof AGENT_STRATEGIES)[number];

export const HANDOFF_STATUSES = [
  "pending_approval",
  "generated",
  "sent",
  "acknowledged",
  "result_imported",
  "completed",
  "failed",
  "cancelled",
] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const HANDOFF_FORMATS = ["markdown", "json", "prompt"] as const;
export type HandoffFormat = (typeof HANDOFF_FORMATS)[number];

export const GIT_PROVIDERS = ["github", "gitlab", "bitbucket", "custom_local"] as const;
export type GitProvider = (typeof GIT_PROVIDERS)[number];

export const STACK_KEYS = [
  "frontend",
  "backend",
  "database",
  "auth",
  "hosting",
  "repository",
  "ai",
] as const;
export type StackKey = (typeof STACK_KEYS)[number];

export const STACK_SOURCES = ["recommended", "user", "detected"] as const;
export type StackSource = (typeof STACK_SOURCES)[number];
