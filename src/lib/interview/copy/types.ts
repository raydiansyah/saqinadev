import type { ConceptCategoryId, LandingConceptId } from "@/content/landing-concepts";
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
} from "../options";
import type { ProfileId } from "../profiles";
import type { Complexity, StepGroup, StepId } from "../types";

export interface OptionCopy {
  label: string;
  description?: string;
}

export interface StepCopy {
  title: string;
  hint?: string;
  /** Shown when the user tries to continue without a valid answer. */
  required: string;
}

export type ModuleId =
  | "website"
  | "employeePortal"
  | "customerPortal"
  | "inventory"
  | "payment"
  | "booking"
  | "pos";

/**
 * Every human-readable string the interview engine produces, per language.
 * Interpolated sentences are functions so word order can follow each language.
 */
export interface EngineCopy {
  options: {
    projectType: Record<ProjectTypeId, OptionCopy>;
    audience: Record<AudienceId, OptionCopy>;
    feature: Record<FeatureId, OptionCopy>;
    projectState: Record<ProjectStateId, OptionCopy>;
    techPreference: Record<TechPreferenceId, OptionCopy>;
    stackLayer: Record<StackLayer, { label: string; placeholder: string }>;
    databaseNeed: Record<DatabaseNeedId, OptionCopy>;
    databaseChoice: Record<DatabaseChoiceId, OptionCopy>;
    developmentMode: Record<DevelopmentModeId, OptionCopy>;
    agent: Record<AgentId, OptionCopy>;
    deployment: Record<DeploymentTargetId, OptionCopy>;
    versioning: Record<VersioningId, OptionCopy>;
  };
  steps: Record<StepId, StepCopy>;
  groups: Record<StepGroup, string>;
  objectiveSuggestions: Record<ProjectTypeId, string[]>;
  concepts: Record<LandingConceptId, { name: string; summary: string }>;
  categories: Record<ConceptCategoryId, string>;
  profiles: Record<ProfileId, { label: string; users: string[]; core: string[] }>;
  complexity: {
    names: Record<Complexity, string>;
    simple: string;
    high: (features: string) => string;
    medium: string;
    low: string;
  };
  /** Joins a list for prose: "a, b and c". */
  joinList: (items: string[]) => string;
  insights: {
    typeNoun: Partial<Record<ProjectTypeId, string>>;
    businessApp: string;
    portal: Partial<Record<ProjectTypeId, string>>;
    webAppFallback: string;
    modules: Record<ModuleId, string>;
    appFeatures: {
      titleBusiness: (noun: string) => string;
      titleWeb: string;
      messageBusiness: (features: string, structure: string, modules: string) => string;
      messageWeb: (noun: string, features: string, structure: string) => string;
      use: (structure: string) => string;
      keep: string;
    };
    multiTenant: { title: string; message: string; replace: string; keep: string };
    noDatabase: {
      title: string;
      message: (what: string) => string;
      coreRecords: string;
      add: string;
      keep: string;
    };
    paymentNoAuth: { title: string; message: string; add: string; keep: string };
    existingInSaqina: { title: string; message: string; switch: string; keep: string };
  };
  landing: {
    why: Record<ProjectTypeId, string>;
    businessApp: string;
    integration: string;
    physical: string;
    override: (suggested: string, firstReason: string) => string;
  };
  recommend: {
    customProject: string;
    newProject: string;
    development: {
      chosenSaqina: string;
      chosenExternal: string;
      existingCode: string;
      large: string;
      small: string;
    };
    agent: { chosen: string; existingCode: string; newProject: string };
    stack: {
      own: string;
      simple: string;
      app: string;
      layers: {
        frontend: string;
        styling: string;
        content: string;
        api: string;
        database: string;
        auth: string;
        ai: string;
      };
      staticPages: string;
      markdown: string;
      apiValue: string;
      aiValue: string;
    };
    database: {
      notRequired: string;
      notRequiredReason: string;
      existing: string;
      yourChoice: string;
      notYet: string;
      notYetReason: string;
      recommended: string;
      recommendedReason: string;
    };
    deployment: {
      defaultTarget: string;
      viaVercel: string;
      otherHost: string;
      connectVercel: string;
      createVercel: string;
      preview: string;
      production: string;
      customDomain: string;
      build: string;
      env: string;
      deployHost: string;
    };
    versioning: { consumers: string; releases: string; small: string };
    integrations: { mcp: string; customDomain: string };
  };
  brief: {
    intro: string;
    objective: string;
    notSpecified: string;
    audience: string;
    features: string;
    suggested: string;
    complexity: string;
    development: string;
    status: string;
    mode: string;
    modeSaqina: string;
    modeAgent: string;
    agent: string;
    chosen: string;
    recommended: string;
    stack: string;
    dataDeploy: string;
    database: string;
    deployment: string;
    pipeline: string;
    versioning: string;
    yes: string;
    no: string;
    landing: string;
    primary: string;
    supporting: string;
    integrations: string;
    none: string;
  };
}
