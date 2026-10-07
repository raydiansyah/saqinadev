import type { LandingConceptId } from "@/content/landing-concepts";
import type {
  AgentId,
  AudienceId,
  DatabaseChoiceId,
  DatabaseNeedId,
  DeploymentTargetId,
  DevelopmentModeId,
  FeatureId,
  ProjectStateId,
  ProjectTypeId,
  StackLayer,
  TechPreferenceId,
  VersioningId,
} from "./options";

export const STEPS = [
  "project",
  "audience",
  "objective",
  "features",
  "existing",
  "technology",
  "database",
  "development",
  "agent",
  "deployment",
  "versioning",
  "landing",
  "review",
] as const;
export type StepId = (typeof STEPS)[number];

/** Progress groups shown to the user (several steps can share one group). */
export const STEP_GROUPS = [
  "Project",
  "Audience",
  "Features",
  "Technology",
  "Development",
  "Deployment",
  "Landing Page",
  "Review",
] as const;
export type StepGroup = (typeof STEP_GROUPS)[number];

export const STEP_GROUP: Record<StepId, StepGroup> = {
  project: "Project",
  audience: "Audience",
  objective: "Audience",
  features: "Features",
  existing: "Technology",
  technology: "Technology",
  database: "Technology",
  development: "Development",
  agent: "Development",
  deployment: "Deployment",
  versioning: "Deployment",
  landing: "Landing Page",
  review: "Review",
};

export type OwnStack = Record<StackLayer, string>;

export interface LandingSelection {
  primary: LandingConceptId;
  supporting: LandingConceptId[];
}

export interface Answers {
  projectType?: ProjectTypeId;
  projectDescription: string;
  audience: AudienceId[];
  objective: string;
  features: FeatureId[];
  featuresUnknown: boolean;
  projectState?: ProjectStateId;
  techPreference?: TechPreferenceId;
  ownStack: OwnStack;
  databaseNeed?: DatabaseNeedId;
  databaseChoice?: DatabaseChoiceId;
  developmentMode?: DevelopmentModeId;
  agent?: AgentId;
  deployment?: DeploymentTargetId;
  versioning?: VersioningId;
  /** User override of the recommended landing concepts. Undefined = follow recommendation. */
  landing?: LandingSelection;
  /**
   * Accepted structural suggestion. Stored as an id so it survives a language switch;
   * the label ("Business Management Web App", "Company Website + Customer Portal") is derived.
   */
  structure?: StructureId;
  dismissedInsights: string[];
}

export const STRUCTURES = ["business-app", "portal"] as const;
export type StructureId = (typeof STRUCTURES)[number];

export const EMPTY_ANSWERS: Answers = {
  projectDescription: "",
  audience: [],
  objective: "",
  features: [],
  featuresUnknown: false,
  ownStack: { frontend: "", backend: "", database: "", auth: "", hosting: "", other: "" },
  dismissedInsights: [],
};

export interface Classification {
  projectType?: ProjectTypeId;
  features: FeatureId[];
  audience: AudienceId[];
  /** Physical/spatial product signals: the only case where 3D is considered. */
  physical: boolean;
}

export interface InsightAction {
  label: string;
  apply: (answers: Answers) => Answers;
}

export interface Insight {
  id: string;
  severity: "info" | "warning";
  /** Step where the insight is surfaced first. Review shows all of them. */
  step: StepId;
  title: string;
  message: string;
  actions: InsightAction[];
}

export type Complexity = "low" | "medium" | "high";

export interface Reasoned<T> {
  value: T;
  reason: string;
  /** true when the value came from the user, false when it was recommended. */
  chosen: boolean;
}

export interface LandingRecommendation {
  primary: LandingConceptId;
  supporting: LandingConceptId[];
  reason: string;
  overridden: boolean;
}

export interface Recommendation {
  projectLabel: string;
  slug: string;
  objective: string;
  audience: string[];
  features: { selected: FeatureId[]; suggested: FeatureId[] };
  complexity: { level: Complexity; reason: string };
  projectState: string;
  development: Reasoned<"saqina" | "external">;
  agent: Reasoned<string> | null;
  stack: Reasoned<{ layer: string; value: string }[]>;
  database: Reasoned<string>;
  deployment: Reasoned<string> & { steps: string[] };
  versioning: Reasoned<boolean> | null;
  landing: LandingRecommendation | null;
  futureIntegrations: string[];
}

export interface PreviewList {
  items: string[];
  /** true while the values come from the engine rather than the user's answers. */
  suggested: boolean;
}

export interface ProjectPreview {
  label: string | null;
  users: PreviewList;
  core: PreviewList;
  complexity: Complexity | null;
  build: "saqina" | "external" | null;
  stack: string[];
  landing: LandingRecommendation | null;
}
