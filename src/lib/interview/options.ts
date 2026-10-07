/**
 * Option ids for the project interview. Labels live in the per-language engine copy
 * (`copy/en.ts`, `copy/id.ts`); this module only defines what can be chosen.
 */

export interface Option<T extends string> {
  id: T;
  label: string;
  description?: string;
}

export const PROJECT_TYPES = [
  "school-website",
  "company-profile",
  "pos",
  "marketplace",
  "saas",
  "internal-dashboard",
  "mobile-backend",
  "ai-application",
  "portfolio",
  "booking",
  "ecommerce",
  "learning-platform",
  "custom",
] as const;
export type ProjectTypeId = (typeof PROJECT_TYPES)[number];

export const AUDIENCES = [
  "public",
  "customers",
  "employees",
  "students",
  "teachers",
  "administrators",
  "business-owners",
  "developers",
  "multiple-roles",
  "other",
] as const;
export type AudienceId = (typeof AUDIENCES)[number];

export const FEATURES = [
  "auth",
  "dashboard",
  "crud",
  "search",
  "filter",
  "payment",
  "chat",
  "notification",
  "file-upload",
  "reports",
  "analytics",
  "ai",
  "maps",
  "booking",
  "inventory",
  "pos",
  "multi-tenant",
  "rbac",
  "api",
  "integration",
] as const;
export type FeatureId = (typeof FEATURES)[number];

export const PROJECT_STATES = ["new", "existing", "migration", "unsure"] as const;
export type ProjectStateId = (typeof PROJECT_STATES)[number];

export const TECH_PREFERENCES = ["recommend", "own", "unknown"] as const;
export type TechPreferenceId = (typeof TECH_PREFERENCES)[number];

export const STACK_LAYERS = [
  "frontend",
  "backend",
  "database",
  "auth",
  "hosting",
  "other",
] as const;
export type StackLayer = (typeof STACK_LAYERS)[number];

export const DATABASE_NEEDS = ["yes", "no", "unsure"] as const;
export type DatabaseNeedId = (typeof DATABASE_NEEDS)[number];

export const DATABASE_CHOICES = [
  "recommend",
  "supabase",
  "postgresql",
  "mysql",
  "other",
  "existing",
] as const;
export type DatabaseChoiceId = (typeof DATABASE_CHOICES)[number];

export const DEVELOPMENT_MODES = ["saqina", "external", "unsure"] as const;
export type DevelopmentModeId = (typeof DEVELOPMENT_MODES)[number];

export const AGENTS = [
  "claude",
  "codex",
  "cursor",
  "kiro",
  "hermes",
  "antigravity",
  "openclaw",
  "other",
  "unsure",
] as const;
export type AgentId = (typeof AGENTS)[number];

export const DEPLOYMENT_TARGETS = [
  "saqina-vercel",
  "existing-vercel",
  "other",
  "self-hosted",
  "unsure",
] as const;
export type DeploymentTargetId = (typeof DEPLOYMENT_TARGETS)[number];

export const VERSIONING_CHOICES = ["yes", "no", "unsure"] as const;
export type VersioningId = (typeof VERSIONING_CHOICES)[number];

/** Builds a labelled option list from ids and their copy. */
export function toOptions<T extends string>(
  ids: readonly T[],
  copy: Record<T, { label: string; description?: string }>,
): Option<T>[] {
  return ids.map((id) => ({ id, ...copy[id] }));
}
