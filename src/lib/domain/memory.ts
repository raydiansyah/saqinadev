/** Vocabularies of the project memory. Plain `as const` tuples; the database stores text, not enums. */

/** What kind of knowledge an asset holds. Only "chat" has a handler today. */
export const ASSET_TYPES = ["chat", "skill", "wiki", "code"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
/** Asset types that can be created now; the rest are reserved so the registry can grow. */
export const SUPPORTED_ASSET_TYPES = [
  "chat",
  "wiki",
  "skill",
] as const satisfies readonly AssetType[];

export const VISIBILITIES = ["private", "project", "organization", "restricted", "agent"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const ASSET_STATUSES = [
  "candidate",
  "pending_review",
  "approved",
  "rejected",
  "superseded",
  "archived",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
/** Statuses that still wait for a person. */
export const REVIEW_STATUSES = [
  "candidate",
  "pending_review",
] as const satisfies readonly AssetStatus[];

/** L0 (the conversation itself) is never copied; it is referenced through `memory_sources`. */
export const MEMORY_LEVELS = ["L1", "L2", "L3"] as const;
export type MemoryLevel = (typeof MEMORY_LEVELS)[number];

export const MEMORY_CONFIDENCES = ["confirmed", "extracted", "inferred", "derived"] as const;
export type MemoryConfidence = (typeof MEMORY_CONFIDENCES)[number];

export const MEMORY_KINDS = [
  "fact",
  "decision",
  "preference",
  "constraint",
  "issue",
  "workaround",
  "question",
  "milestone",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const SOURCE_TYPES = [
  "message",
  "conversation",
  "document",
  "document_version",
  "decision",
  "repo_file",
  "memory",
  "manual",
  "agent_run",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const PRINCIPAL_TYPES = ["user", "agent"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];
export const ACL_PERMISSIONS = ["read", "manage"] as const;
export type AclPermission = (typeof ACL_PERMISSIONS)[number];

export const BINDING_TARGETS = ["agent", "agent_role", "assistant"] as const;
export type BindingTarget = (typeof BINDING_TARGETS)[number];
export const BINDING_MODES = ["always", "on_demand"] as const;
export type BindingMode = (typeof BINDING_MODES)[number];

export const JOB_KINDS = [
  "extract_chat",
  "consolidate",
  "index_wiki",
  "extract_skill",
  "index_code",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export const JOB_STATUSES = [
  "queued",
  "processing",
  "ready",
  "failed_retryable",
  "failed_permanent",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Where a wiki page's text comes from. PDFs and Office files are not read yet. */
export const WIKI_SOURCE_TYPES = ["document", "repo_file"] as const;
export type WikiSourceType = (typeof WIKI_SOURCE_TYPES)[number];
export const WIKI_SOURCE_STATUSES = ["ready", "failed"] as const;
export type WikiSourceStatus = (typeof WIKI_SOURCE_STATUSES)[number];

/** Where a skill came from: written by a person, or proposed from a finished agent run. */
export const SKILL_ORIGINS = ["manual", "run"] as const;
export type SkillOrigin = (typeof SKILL_ORIGINS)[number];
/** How a use of a skill turned out. Empty until someone (or the run's result) says. */
export const SKILL_OUTCOMES = ["success", "partial", "failure"] as const;
export type SkillOutcome = (typeof SKILL_OUTCOMES)[number];
