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
export const ANSWER_SOURCES = ["user", "inferred", "imported", "system"] as const;
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

export const TASK_SOURCES = ["plan", "user", "agent"] as const;
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

export const MEMORY_SOURCES = ["interview", "recommendation", "user", "agent"] as const;
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
  "milestone.updated",
  "memory.created",
  "memory.updated",
  "decision.created",
  "decision.updated",
  "agent.updated",
  "settings.updated",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const REPO_PROVIDERS = ["github", "gitlab", "bitbucket", "custom"] as const;
export type RepoProvider = (typeof REPO_PROVIDERS)[number];

export const DEPLOY_PROVIDERS = ["vercel", "other", "self-hosted"] as const;
export type DeployProvider = (typeof DEPLOY_PROVIDERS)[number];
