import type { AnswerSource, RecommendationKey } from "@/lib/domain/enums";
import type { ProjectTypeId } from "@/lib/interview/options";
import { isStepComplete, isStepVisible } from "@/lib/interview/rules/visibility";
import { type Answers, EMPTY_ANSWERS, type StepId } from "@/lib/interview/types";

/**
 * Persistent (Phase 2) interview model. It wraps the Phase 1 answer shape and adds what a
 * real project needs: platforms, sign-in methods, type-specific follow-ups, constraints and
 * per-answer provenance.
 */

export const PLATFORMS = ["web", "mobile", "desktop"] as const;
export type PlatformId = (typeof PLATFORMS)[number];

export const AUTH_METHODS = ["email", "google", "none"] as const;
export type AuthMethodId = (typeof AUTH_METHODS)[number];

export const TIMELINES = ["weeks", "months", "flexible", "unsure"] as const;
export type TimelineId = (typeof TIMELINES)[number];

/** Answer for a follow-up question; "unsure" is recorded as an open question. */
export const FOLLOW_UP_ANSWERS = ["yes", "no", "unsure"] as const;
export type FollowUpAnswer = (typeof FOLLOW_UP_ANSWERS)[number];

export const FOLLOW_UPS = [
  "sellerAccounts",
  "buyerAccounts",
  "inPlatformPayments",
  "commission",
  "tableManagement",
  "multiOutlet",
  "stockTracking",
  "onlinePayments",
  "staffSchedules",
  "reminders",
  "deposits",
  "orgWorkspaces",
  "subscriptionBilling",
  "freeTrial",
  "certificates",
  "assessments",
  "paidCourses",
  "shipping",
  "variants",
  "guestCheckout",
] as const;
export type FollowUpKey = (typeof FOLLOW_UPS)[number];

/**
 * Conditional questions per project type. Types without transactions (portfolio, company
 * profile, school website) get none: no seller, inventory or payment questions.
 */
export const FOLLOW_UPS_BY_TYPE: Partial<Record<ProjectTypeId, FollowUpKey[]>> = {
  marketplace: ["sellerAccounts", "buyerAccounts", "inPlatformPayments", "commission"],
  pos: ["tableManagement", "multiOutlet", "stockTracking"],
  booking: ["staffSchedules", "reminders", "onlinePayments", "deposits"],
  saas: ["orgWorkspaces", "subscriptionBilling", "freeTrial"],
  "learning-platform": ["assessments", "certificates", "paidCourses"],
  ecommerce: ["shipping", "variants", "guestCheckout", "onlinePayments"],
};

export function followUpsFor(type: ProjectTypeId | undefined): FollowUpKey[] {
  return type ? (FOLLOW_UPS_BY_TYPE[type] ?? []) : [];
}

export interface ProjectDetails {
  platforms: PlatformId[];
  authMethods: AuthMethodId[];
  followUps: Partial<Record<FollowUpKey, FollowUpAnswer>>;
  constraints: string;
  timeline?: TimelineId;
}

export const EMPTY_DETAILS: ProjectDetails = {
  platforms: [],
  authMethods: [],
  followUps: {},
  constraints: "",
};

/** User overrides of recommendations, kept with the interview until the project exists. */
export type RecommendationOverrides = Partial<Record<RecommendationKey, string>>;

/** Conflicts the user resolved on the review screen, by conflict id. */
export type ConflictResolutions = Record<string, string>;

/** Open questions the user chose to keep unresolved. */
export type KeptUnresolved = string[];

export interface InterviewData {
  answers: Answers;
  details: ProjectDetails;
  overrides: RecommendationOverrides;
  resolutions: ConflictResolutions;
  keptUnresolved: KeptUnresolved;
  /** Provenance per question key. Missing key means the user answered. */
  sources: Partial<Record<QuestionKey, AnswerSource>>;
}

export const EMPTY_INTERVIEW: InterviewData = {
  answers: EMPTY_ANSWERS,
  details: EMPTY_DETAILS,
  overrides: {},
  resolutions: {},
  keptUnresolved: [],
  sources: {},
};

/** Every persisted answer row has one of these keys. */
export const ANSWER_KEYS = [
  "projectType",
  "projectDescription",
  "audience",
  "objective",
  "features",
  "featuresUnknown",
  "projectState",
  "techPreference",
  "ownStack",
  "databaseNeed",
  "databaseChoice",
  "developmentMode",
  "agent",
  "deployment",
  "versioning",
  "landing",
  "structure",
  "dismissedInsights",
] as const satisfies readonly (keyof Answers)[];
export type AnswerKey = (typeof ANSWER_KEYS)[number];

export const EXTRA_KEYS = ["details", "overrides", "resolutions", "keptUnresolved"] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];

export type QuestionKey = AnswerKey | ExtraKey;

export const STEPS = [
  "project",
  "audience",
  "objective",
  "features",
  "followups",
  "platform",
  "existing",
  "technology",
  "database",
  "development",
  "agent",
  "deployment",
  "versioning",
  "landing",
  "constraints",
  "review",
] as const;
export type InterviewStep = (typeof STEPS)[number];

/** Conceptual stages shown instead of "question 4 of 37". */
export const STAGES = [
  "idea",
  "users",
  "features",
  "experience",
  "technical",
  "constraints",
  "review",
] as const;
export type InterviewStage = (typeof STAGES)[number];

export const STAGE_OF: Record<InterviewStep, InterviewStage> = {
  project: "idea",
  audience: "users",
  objective: "users",
  features: "features",
  followups: "features",
  platform: "experience",
  landing: "experience",
  existing: "technical",
  technology: "technical",
  database: "technical",
  development: "technical",
  agent: "technical",
  deployment: "technical",
  versioning: "technical",
  constraints: "constraints",
  review: "review",
};

const isPhase1Step = (step: InterviewStep): step is StepId =>
  step !== "followups" && step !== "platform" && step !== "constraints";

export function isVisible(step: InterviewStep, data: InterviewData): boolean {
  if (step === "followups") return followUpsFor(data.answers.projectType).length > 0;
  if (!isPhase1Step(step)) return true;
  return isStepVisible(step, data.answers);
}

export function visibleSteps(data: InterviewData): InterviewStep[] {
  return STEPS.filter((s) => isVisible(s, data));
}

/** Steps that must be answered to continue. Everything else may be skipped and stays unknown. */
export function isRequired(step: InterviewStep): boolean {
  return step === "project";
}

export function isComplete(step: InterviewStep, data: InterviewData): boolean {
  if (!isPhase1Step(step)) return true;
  return isStepComplete(step, data.answers);
}

export function nextVisible(step: InterviewStep, data: InterviewData): InterviewStep {
  const visible = visibleSteps(data);
  return STEPS.slice(STEPS.indexOf(step) + 1).find((s) => visible.includes(s)) ?? "review";
}

export function previousVisible(step: InterviewStep, data: InterviewData): InterviewStep | null {
  const visible = visibleSteps(data);
  return (
    STEPS.slice(0, STEPS.indexOf(step))
      .filter((s) => visible.includes(s))
      .at(-1) ?? null
  );
}

export const isInterviewStep = (value: string): value is InterviewStep =>
  (STEPS as readonly string[]).includes(value);
