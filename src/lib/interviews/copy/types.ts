import type { RecommendationKey, RequirementGroup } from "@/lib/domain/enums";
import type { FeatureId } from "@/lib/interview/options";
import type { AuthMethodId, FollowUpKey, PlatformId, TimelineId } from "../model";

export interface ChoiceCopy {
  label: string;
}

/** Strings produced by the Phase 2 analyzer, recommendation layer and project generator. */
export interface ProjectCopy {
  platforms: Record<PlatformId, string>;
  authMethods: Record<AuthMethodId, string>;
  timelines: Record<TimelineId, string>;
  followUps: Record<FollowUpKey, { question: string; requirement: string; no: string }>;
  groups: Record<RequirementGroup, string>;
  featureDescriptions: Record<FeatureId, string>;
  requirement: {
    overviewTitle: string;
    overview: (name: string, objective: string) => string;
    audienceTitle: (audience: string) => string;
    audience: (audience: string) => string;
    roleTitle: (role: string) => string;
    role: (role: string) => string;
    signInTitle: string;
    signIn: (methods: string) => string;
    noSignIn: string;
    platformTitle: string;
    platform: (platforms: string) => string;
    databaseTitle: string;
    database: (value: string) => string;
    deploymentTitle: string;
    deployment: (value: string) => string;
    constraintsTitle: string;
    timelineTitle: string;
    timeline: (value: string) => string;
    existingTitle: string;
    existing: (state: string) => string;
  };
  open: Record<
    | "objective"
    | "audience"
    | "features"
    | "featuresUnknown"
    | "payment"
    | "signIn"
    | "platform"
    | "database"
    | "deployment"
    | "build"
    | "timeline",
    { title: string; message: string }
  >;
  openFollowUp: (question: string) => { title: string; message: string };
  assumption: {
    projectType: (type: string, from: string) => string;
    features: (features: string) => string;
    audience: (audience: string) => string;
    rbac: string;
    rbacTitle: string;
    platformWeb: string;
    platformWebTitle: string;
  };
  conflicts: {
    platformDeploy: {
      title: string;
      message: (deployment: string) => string;
      options: { mobile: string; web: string; both: string };
    };
    paymentFollowUp: { title: string; message: string; options: { keep: string; remove: string } };
    noDatabase: { title: string; message: string; options: { add: string; keep: string } };
    authNone: { title: string; message: string; options: { keep: string; remove: string } };
    existingSaqina: {
      title: string;
      message: string;
      options: { external: string; saqina: string };
    };
  };
  risks: Partial<Record<FeatureId, string>> & { existing: string; unknowns: (n: number) => string };
  recommendation: {
    labels: Record<RecommendationKey, string>;
    application: { simple: string; api: string; app: string; own: string };
    auth: {
      none: string;
      noneReason: string;
      chosen: (methods: string) => string;
      chosenReason: string;
      recommended: string;
      recommendedReason: string;
    };
    architecture: {
      staticSite: string;
      staticReason: string;
      api: string;
      apiReason: string;
      modular: string;
      modularReason: string;
      fullStack: string;
      fullStackReason: string;
    };
    buildStrategy: { saqina: string; external: (agent: string) => string };
    userOverride: string;
  };
}
