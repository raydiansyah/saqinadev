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
  "git_push",
  "deploy",
  "delete_project",
] as const;
export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

/** Default role agents every project gets (provider saqina, simulated execution in Phase 3). */
export const AGENT_ROLES = ["general", "planner", "frontend", "backend", "qa", "docs"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
