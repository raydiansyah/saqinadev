import type { AgentType, MemoryCategory, Priority, RequirementStatus } from "@/lib/domain/enums";

/** Templates for the documents and records generated when a project is created. */
export interface GeneratorCopy {
  priorities: Record<Priority, string>;
  statuses: Record<RequirementStatus, string>;
  inferredMark: string;
  none: string;
  toBeDefined: string;
  prd: {
    title: string;
    draftNote: string;
    headings: [
      overview: string,
      problem: string,
      goals: string,
      nonGoals: string,
      users: string,
      roles: string,
      features: string,
      flows: string,
      functional: string,
      nonFunctional: string,
      integrations: string,
      data: string,
      security: string,
      ux: string,
      technical: string,
      risks: string,
      openQuestions: string,
      acceptance: string,
    ];
    type: string;
    complexity: string;
    problem: (objective: string) => string;
    noObjective: string;
    goalFeature: (feature: string) => string;
    nonGoalsIntro: string;
    nonGoalsDefault: string;
    flowSignIn: (who: string) => string;
    flowCore: (who: string, feature: string) => string;
    flowAdmin: string;
    flowNote: string;
    nonFunctional: string[];
    platform: (platforms: string) => string;
    securityAuth: string;
    securityRoles: string;
    securityData: string;
    securityNoAuth: string;
    landing: (concept: string) => string;
    acceptance: (feature: string) => string;
  };
  plan: {
    title: string;
    intro: string;
    milestones: {
      foundation: { title: string; goal: string };
      core: { title: string; goal: string };
      launch: { title: string; goal: string };
    };
    tasks: {
      setup: string;
      database: string;
      auth: string;
      shell: string;
      roles: string;
      feature: (feature: string) => string;
      openQuestions: string;
      tests: string;
      deploy: (target: string) => string;
      landing: (concept: string) => string;
    };
  };
  memory: {
    goal: string;
    architecture: (value: string) => string;
    database: (value: string) => string;
    deployment: (value: string) => string;
    auth: (value: string) => string;
    build: (value: string) => string;
    landing: (value: string) => string;
    constraints: string;
    reason: (reason: string) => string;
  };
  memoryCategories: Record<MemoryCategory, string>;
  decisions: {
    application: string;
    database: string;
    auth: string;
    build: string;
    context: string;
  };
  agents: Record<AgentType, { name: string; provider: string }>;
}
