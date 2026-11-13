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

export const REQUIREMENT_STATUSES = ["confirmed", "inferred", "unknown", "conflicting"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DOCUMENT_TYPES = [
  "prd",
  "plan",
  "memory",
  "decision",
  "notes",
  "requirements",
  "custom",
  "proposal",
  "agreement",
  "handover",
  "maintenance_agreement",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["draft", "review", "approved", "signed", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

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
  "document.signed",
  "document.issued",
  "document.changes_requested",
  "task.created",
  "task.updated",
  "task.completed",
  "task.reopened",
  "task.deleted",
  "milestone.updated",
  "memory.created",
  "memory.updated",
  "memory.approved",
  "memory.archived",
  "memory.unshared",
  "memory.deleted",
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
  // Phase 5: business layer
  "client.assigned",
  "portal.enabled",
  "portal.disabled",
  "scope.created",
  "scope.updated",
  "scope.deleted",
  "billing.schedule_updated",
  "invoice.created",
  "invoice.issued",
  "invoice.sent",
  "invoice.cancelled",
  "payment.recorded",
  "payment.voided",
  "receipt.issued",
  // Phase 6: client engagement and maintenance
  "request.created",
  "request.updated",
  "message.posted",
  "approval.requested",
  "approval.responded",
  "change_request.created",
  "change_request.sent",
  "change_request.decided",
  "change_request.updated",
  "maintenance.plan_updated",
  "maintenance.classified",
  "reminder.sent",
  // Meeting notes
  "meeting_note.submitted",
  "meeting_note.updated",
  "meeting_note.deleted",
  "meeting_note.reviewed",
  "meeting_note.confirmed",
  "meeting_note.analyzed",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const REPO_PROVIDERS = ["github", "gitlab", "bitbucket", "custom"] as const;
export type RepoProvider = (typeof REPO_PROVIDERS)[number];

export const DEPLOY_PROVIDERS = ["vercel", "other", "self-hosted"] as const;
export type DeployProvider = (typeof DEPLOY_PROVIDERS)[number];

// ── Phase 3: assistant, proposals and agent orchestration ──────────────────────────────

/** What a conversation is anchored to. `project` means no specific entity. */
/** READ never mutates; DESTRUCTIVE, EXTERNAL and AGENT always need a human approval. */
export const APPROVAL_POLICIES = ["auto_low_risk", "always"] as const;
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];

/** What an agent can do (skills). Never implies it is allowed to do it. */
/** What an agent is allowed to touch in this project. Separate from capabilities. */
/** Default role agents every project gets (provider saqina, simulated execution in Phase 3). */
// ── Phase 4: control plane, tools, MCP, external agents and Git ─────────────────────────

export const PLATFORM_ROLES = ["user", "owner"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Which adapter talks to the provider. New providers add an adapter, not a code path. */
/** Declared by the Owner per model; never guessed from the model name. */
/** New tools start as discovered and do nothing until someone enables them. */
/** Where a project's name came from; only an `auto` name is renamed from the plan. */
export const PROJECT_NAME_SOURCES = ["auto", "user", "repository"] as const;
export type ProjectNameSource = (typeof PROJECT_NAME_SOURCES)[number];

/** A connection belongs to one project, or to the platform and serves every project. */
/** Where an installed skill is offered to a model. */
/** `url_key`: the secret is part of the endpoint URL (`{apiKey}`), filled in only at call time. */
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

/** Where a document version came from: loop-proofing for sync and a trail in the history. */
export const VERSION_SOURCES = ["user", "import", "sync", "mcp", "assistant"] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

// ── Sync: Git events, CI, deployments ──────────────────────────────────────────────────

/** Where a linked pull request stands. */
/** Whose Vercel account hosts the project: Saqina's team (default) or the client's own. */
/** A database or sign-in service the project's own app uses, always the user's own account. */
/** Where an environment variable came from. */
