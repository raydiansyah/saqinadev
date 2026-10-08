import type {
  AnswerSource,
  Confidence,
  Priority,
  RequirementGroup,
  RequirementStatus,
} from "@/lib/domain/enums";
import type { EngineCopy } from "@/lib/interview/copy/types";
import type { FeatureId, ProjectTypeId } from "@/lib/interview/options";
import { profileFor } from "@/lib/interview/profiles";
import { complexityOf, DATA_FEATURES, isSimpleSite } from "@/lib/interview/rules/profile";
import { FEATURES_BY_TYPE, projectName } from "@/lib/interview/rules/recommend";
import type { Complexity } from "@/lib/interview/types";
import type { ProjectCopy } from "./copy/types";
import {
  followUpsFor,
  type InterviewData,
  type InterviewStep,
  type ProjectDetails,
  type QuestionKey,
} from "./model";

export interface RequirementDraft {
  /** Stable id so re-analysis and the review screen can refer to the same item. */
  key: string;
  group: RequirementGroup;
  title: string;
  description: string;
  priority: Priority;
  status: RequirementStatus;
  source: AnswerSource;
  confidence: Confidence;
}

export interface ConflictOption {
  id: string;
  label: string;
  /** Data change applied when the user picks this option. */
  apply: (data: InterviewData) => InterviewData;
}

export interface Conflict {
  id: string;
  title: string;
  message: string;
  options: ConflictOption[];
}

export interface OpenQuestion {
  id: string;
  title: string;
  message: string;
  /** Where the user can answer it. */
  step: InterviewStep;
  kept: boolean;
}

export interface Assumption {
  id: string;
  title: string;
  message: string;
  /** Confirming marks this key as user-provided; "rbac" adds the feature. */
  key: QuestionKey | "rbac" | "platform";
}

export interface Analysis {
  name: string;
  requirements: RequirementDraft[];
  conflicts: Conflict[];
  openQuestions: OpenQuestion[];
  assumptions: Assumption[];
  risks: string[];
  complexity: { level: Complexity; reason: string };
  counts: Record<RequirementStatus, number>;
}

/**
 * Turns interview data into structured requirements without guessing silently.
 * Contract kept small so an AI-backed analyzer can replace the rules later.
 */
export interface InterviewAnalyzer {
  analyze(data: InterviewData): Analysis;
}

/** Types where money changes hands, so an undefined payment approach is an open question. */
const TRANSACTIONAL: ProjectTypeId[] = ["marketplace", "ecommerce", "booking", "saas"];
const PAYMENT_FOLLOW_UPS = ["inPlatformPayments", "onlinePayments", "subscriptionBilling"] as const;
const WEB_DEPLOYMENTS = ["saqina-vercel", "existing-vercel"];

const statusOf = (source: AnswerSource | undefined): RequirementStatus =>
  source === "inferred" ? "inferred" : "confirmed";
const confidenceOf = (source: AnswerSource | undefined): Confidence =>
  source === "inferred" ? "medium" : "high";

function featurePriority(feature: FeatureId, type: ProjectTypeId | undefined): Priority {
  if (
    feature === "auth" ||
    (feature === "payment" && (type === "marketplace" || type === "ecommerce"))
  ) {
    return "critical";
  }
  return FEATURES_BY_TYPE[type ?? "custom"].includes(feature) ? "high" : "medium";
}

function withFollowUps(details: ProjectDetails, patch: Partial<ProjectDetails["followUps"]>) {
  return { ...details, followUps: { ...details.followUps, ...patch } };
}

function detectConflicts(data: InterviewData, copy: ProjectCopy, engine: EngineCopy): Conflict[] {
  const { answers, details, resolutions } = data;
  const t = copy.conflicts;
  const conflicts: Conflict[] = [];
  const resolved = (id: string) => id in resolutions;
  const resolve = (d: InterviewData, id: string, option: string): InterviewData => ({
    ...d,
    resolutions: { ...d.resolutions, [id]: option },
  });

  const mobileOnly = details.platforms.length === 1 && details.platforms[0] === "mobile";
  if (mobileOnly && answers.deployment && WEB_DEPLOYMENTS.includes(answers.deployment)) {
    const id = "platform-deploy";
    if (!resolved(id)) {
      const setPlatforms = (platforms: ProjectDetails["platforms"]) => (d: InterviewData) =>
        resolve({ ...d, details: { ...d.details, platforms } }, id, platforms.join("+"));
      conflicts.push({
        id,
        title: t.platformDeploy.title,
        message: t.platformDeploy.message(engine.options.deployment[answers.deployment].label),
        options: [
          { id: "mobile", label: t.platformDeploy.options.mobile, apply: setPlatforms(["mobile"]) },
          { id: "web", label: t.platformDeploy.options.web, apply: setPlatforms(["web"]) },
          {
            id: "both",
            label: t.platformDeploy.options.both,
            apply: setPlatforms(["web", "mobile"]),
          },
        ],
      });
    }
  }

  const declinedPayments = PAYMENT_FOLLOW_UPS.filter((k) => details.followUps[k] === "no");
  if (answers.features.includes("payment") && declinedPayments.length > 0) {
    const id = "payment-followup";
    if (!resolved(id)) {
      conflicts.push({
        id,
        title: t.paymentFollowUp.title,
        message: t.paymentFollowUp.message,
        options: [
          {
            id: "keep",
            label: t.paymentFollowUp.options.keep,
            apply: (d) =>
              resolve(
                {
                  ...d,
                  details: withFollowUps(
                    d.details,
                    Object.fromEntries(declinedPayments.map((k) => [k, "yes"])),
                  ),
                },
                id,
                "keep",
              ),
          },
          {
            id: "remove",
            label: t.paymentFollowUp.options.remove,
            apply: (d) =>
              resolve(
                {
                  ...d,
                  answers: {
                    ...d.answers,
                    features: d.answers.features.filter((f) => f !== "payment"),
                  },
                },
                id,
                "remove",
              ),
          },
        ],
      });
    }
  }

  const needsData = answers.features.some((f) => DATA_FEATURES.includes(f));
  if (answers.databaseNeed === "no" && needsData && !resolved("no-database")) {
    const id = "no-database";
    conflicts.push({
      id,
      title: t.noDatabase.title,
      message: t.noDatabase.message,
      options: [
        {
          id: "add",
          label: t.noDatabase.options.add,
          apply: (d) =>
            resolve(
              { ...d, answers: { ...d.answers, databaseNeed: "yes", databaseChoice: "recommend" } },
              id,
              "add",
            ),
        },
        { id: "keep", label: t.noDatabase.options.keep, apply: (d) => resolve(d, id, "keep") },
      ],
    });
  }

  const wantsAccounts = answers.features.includes("auth") || answers.features.includes("rbac");
  if (details.authMethods.includes("none") && wantsAccounts && !resolved("auth-none")) {
    const id = "auth-none";
    conflicts.push({
      id,
      title: t.authNone.title,
      message: t.authNone.message,
      options: [
        {
          id: "keep",
          label: t.authNone.options.keep,
          apply: (d) =>
            resolve({ ...d, details: { ...d.details, authMethods: ["email"] } }, id, "keep"),
        },
        {
          id: "remove",
          label: t.authNone.options.remove,
          apply: (d) =>
            resolve(
              {
                ...d,
                answers: {
                  ...d.answers,
                  features: d.answers.features.filter((f) => f !== "auth" && f !== "rbac"),
                },
              },
              id,
              "remove",
            ),
        },
      ],
    });
  }

  const existingCode = answers.projectState === "existing" || answers.projectState === "migration";
  if (existingCode && answers.developmentMode === "saqina" && !resolved("existing-saqina")) {
    const id = "existing-saqina";
    conflicts.push({
      id,
      title: t.existingSaqina.title,
      message: t.existingSaqina.message,
      options: [
        {
          id: "external",
          label: t.existingSaqina.options.external,
          apply: (d) =>
            resolve(
              { ...d, answers: { ...d.answers, developmentMode: "external" } },
              id,
              "external",
            ),
        },
        {
          id: "saqina",
          label: t.existingSaqina.options.saqina,
          apply: (d) => resolve(d, id, "saqina"),
        },
      ],
    });
  }

  return conflicts;
}

function detectOpenQuestions(data: InterviewData, copy: ProjectCopy): OpenQuestion[] {
  const { answers, details, keptUnresolved } = data;
  const open: OpenQuestion[] = [];
  const add = (id: keyof ProjectCopy["open"], step: InterviewStep) =>
    open.push({ id, step, kept: keptUnresolved.includes(id), ...copy.open[id] });
  const simple = isSimpleSite(answers);

  if (answers.objective.trim().length < 10) add("objective", "objective");
  if (answers.audience.length === 0) add("audience", "audience");
  if (answers.features.length === 0)
    add(answers.featuresUnknown ? "featuresUnknown" : "features", "features");

  const paymentDecided =
    answers.features.includes("payment") ||
    PAYMENT_FOLLOW_UPS.some((k) => details.followUps[k] === "yes" || details.followUps[k] === "no");
  if (answers.projectType && TRANSACTIONAL.includes(answers.projectType) && !paymentDecided) {
    add("payment", "features");
  }
  if (answers.features.includes("auth") && details.authMethods.length === 0)
    add("signIn", "platform");
  if (details.platforms.length === 0) add("platform", "platform");
  if (!simple && (!answers.databaseNeed || answers.databaseNeed === "unsure"))
    add("database", "database");
  if (!answers.deployment || answers.deployment === "unsure") add("deployment", "deployment");
  if (!answers.developmentMode || answers.developmentMode === "unsure") add("build", "development");
  if (!details.timeline || details.timeline === "unsure") add("timeline", "constraints");

  for (const key of followUpsFor(answers.projectType)) {
    const value = details.followUps[key];
    if (value === undefined || value === "unsure") {
      const id = `followup:${key}`;
      open.push({
        id,
        step: "followups",
        kept: keptUnresolved.includes(id),
        ...copy.openFollowUp(copy.followUps[key].question),
      });
    }
  }
  return open;
}

/** Owners plus staff or customers imply different permissions even if nobody said "roles". */
function impliesRoles(data: InterviewData): boolean {
  const { audience, features, projectDescription } = data.answers;
  if (features.includes("rbac")) return false;
  const people = new Set(audience);
  const mixed =
    people.has("multiple-roles") ||
    (people.has("business-owners") && (people.has("employees") || people.has("customers"))) ||
    (people.has("administrators") && people.size > 1);
  return (
    mixed || /\b(staff|karyawan|pegawai|cashier|kasir|manager|admin)\b/i.test(projectDescription)
  );
}

function detectAssumptions(
  data: InterviewData,
  copy: ProjectCopy,
  engine: EngineCopy,
): Assumption[] {
  const { answers, sources, details } = data;
  const t = copy.assumption;
  const list: Assumption[] = [];
  const from = answers.projectDescription.trim().slice(0, 80);

  if (answers.projectType && sources.projectType === "inferred") {
    list.push({
      id: "projectType",
      key: "projectType",
      title: engine.options.projectType[answers.projectType].label,
      message: t.projectType(engine.options.projectType[answers.projectType].label, from),
    });
  }
  if (answers.features.length > 0 && sources.features === "inferred") {
    const labels = engine.joinList(answers.features.map((f) => engine.options.feature[f].label));
    list.push({ id: "features", key: "features", title: labels, message: t.features(labels) });
  }
  if (answers.audience.length > 0 && sources.audience === "inferred") {
    const labels = engine.joinList(answers.audience.map((a) => engine.options.audience[a].label));
    list.push({ id: "audience", key: "audience", title: labels, message: t.audience(labels) });
  }
  if (impliesRoles(data))
    list.push({ id: "rbac", key: "rbac", title: t.rbacTitle, message: t.rbac });
  if (details.platforms.length === 0) {
    list.push({
      id: "platform",
      key: "platform",
      title: t.platformWebTitle,
      message: t.platformWeb,
    });
  }
  return list;
}

function buildRequirements(
  data: InterviewData,
  copy: ProjectCopy,
  engine: EngineCopy,
  name: string,
  open: OpenQuestion[],
  conflicts: Conflict[],
  assumptions: Assumption[],
): RequirementDraft[] {
  const { answers, details, sources } = data;
  const r = copy.requirement;
  const list: RequirementDraft[] = [];
  const push = (item: Omit<RequirementDraft, "confidence"> & { confidence?: Confidence }) =>
    list.push({ confidence: confidenceOf(item.source), ...item });

  if (answers.objective.trim().length >= 10) {
    push({
      key: "overview",
      group: "overview",
      title: r.overviewTitle,
      description: r.overview(name, answers.objective.trim()),
      priority: "high",
      status: "confirmed",
      source: sources.objective ?? "user",
    });
  }

  for (const audience of answers.audience) {
    const label = engine.options.audience[audience].label;
    push({
      key: `audience:${audience}`,
      group: "users_roles",
      title: r.audienceTitle(label),
      description: r.audience(label),
      priority: "high",
      status: statusOf(sources.audience),
      source: sources.audience ?? "user",
    });
  }

  // Roles suggested by the matched profile are inferred until the user edits them.
  const profile = profileFor(answers);
  if (profile) {
    for (const role of engine.profiles[profile.id].users) {
      push({
        key: `role:${role}`,
        group: "users_roles",
        title: r.roleTitle(role),
        description: r.role(role),
        priority: "medium",
        status: "inferred",
        source: "inferred",
        confidence: "medium",
      });
    }
  }

  for (const feature of answers.features) {
    push({
      key: `feature:${feature}`,
      group: feature === "auth" || feature === "rbac" ? "authentication" : "features",
      title: engine.options.feature[feature].label,
      description: copy.featureDescriptions[feature],
      priority: featurePriority(feature, answers.projectType),
      status: statusOf(sources.features),
      source: sources.features ?? "user",
    });
  }

  if (assumptions.some((a) => a.key === "rbac")) {
    push({
      key: "feature:rbac",
      group: "authentication",
      title: engine.options.feature.rbac.label,
      description: copy.featureDescriptions.rbac,
      priority: "high",
      status: "inferred",
      source: "inferred",
      confidence: "medium",
    });
  }

  if (details.authMethods.length > 0) {
    const methods = details.authMethods.filter((m) => m !== "none");
    push({
      key: "auth:methods",
      group: "authentication",
      title: r.signInTitle,
      description:
        methods.length > 0
          ? r.signIn(engine.joinList(methods.map((m) => copy.authMethods[m])))
          : r.noSignIn,
      priority: methods.length > 0 ? "critical" : "medium",
      status: "confirmed",
      source: "user",
    });
  }

  for (const key of followUpsFor(answers.projectType)) {
    const value = details.followUps[key];
    if (value === "yes" || value === "no") {
      push({
        key: `rule:${key}`,
        group:
          key.toLowerCase().includes("payment") || key === "commission" || key === "deposits"
            ? "integrations"
            : "business_rules",
        title: copy.followUps[key].question,
        description: value === "yes" ? copy.followUps[key].requirement : copy.followUps[key].no,
        priority: value === "yes" ? "high" : "low",
        status: "confirmed",
        source: "user",
      });
    }
  }

  if (details.platforms.length > 0) {
    push({
      key: "ux:platform",
      group: "ux",
      title: r.platformTitle,
      description: r.platform(engine.joinList(details.platforms.map((p) => copy.platforms[p]))),
      priority: "high",
      status: "confirmed",
      source: "user",
    });
  } else {
    push({
      key: "ux:platform",
      group: "ux",
      title: r.platformTitle,
      description: copy.assumption.platformWeb,
      priority: "high",
      status: "inferred",
      source: "inferred",
      confidence: "medium",
    });
  }

  if (answers.databaseNeed === "yes" || answers.databaseNeed === "no") {
    const value =
      answers.databaseNeed === "no"
        ? engine.recommend.database.notRequired
        : answers.databaseChoice && answers.databaseChoice !== "recommend"
          ? engine.options.databaseChoice[answers.databaseChoice].label
          : engine.recommend.database.recommended;
    push({
      key: "data:database",
      group: "data",
      title: r.databaseTitle,
      description: r.database(value),
      priority: "high",
      status: "confirmed",
      source: sources.databaseNeed ?? "user",
    });
  }

  if (answers.deployment && answers.deployment !== "unsure") {
    push({
      key: "infra:deployment",
      group: "infrastructure",
      title: r.deploymentTitle,
      description: r.deployment(engine.options.deployment[answers.deployment].label),
      priority: "medium",
      status: "confirmed",
      source: sources.deployment ?? "user",
    });
  }

  if (answers.projectState === "existing" || answers.projectState === "migration") {
    push({
      key: "constraint:existing",
      group: "constraints",
      title: r.existingTitle,
      description: r.existing(engine.options.projectState[answers.projectState].label),
      priority: "high",
      status: "confirmed",
      source: "user",
    });
  }
  if (details.constraints.trim()) {
    push({
      key: "constraint:text",
      group: "constraints",
      title: r.constraintsTitle,
      description: details.constraints.trim(),
      priority: "high",
      status: "confirmed",
      source: "user",
    });
  }
  if (details.timeline && details.timeline !== "unsure") {
    push({
      key: "constraint:timeline",
      group: "constraints",
      title: r.timelineTitle,
      description: r.timeline(copy.timelines[details.timeline]),
      priority: "medium",
      status: "confirmed",
      source: "user",
    });
  }

  for (const question of open) {
    push({
      key: `open:${question.id}`,
      group: "open_questions",
      title: question.title,
      description: question.message,
      priority: question.id === "payment" || question.id === "signIn" ? "high" : "medium",
      status: "unknown",
      source: "system",
      confidence: "low",
    });
  }
  for (const conflict of conflicts) {
    push({
      key: `conflict:${conflict.id}`,
      group: "open_questions",
      title: conflict.title,
      description: conflict.message,
      priority: "high",
      status: "conflicting",
      source: "system",
      confidence: "low",
    });
  }
  for (const assumption of assumptions) {
    if (assumption.key === "rbac" || assumption.key === "platform") continue;
    push({
      key: `assumption:${assumption.id}`,
      group: "assumptions",
      title: assumption.title,
      description: assumption.message,
      priority: "low",
      status: "inferred",
      source: "inferred",
      confidence: "medium",
    });
  }
  return list;
}

function detectRisks(data: InterviewData, copy: ProjectCopy, unknowns: number): string[] {
  const risks: string[] = [];
  for (const feature of data.answers.features) {
    const risk = copy.risks[feature];
    if (risk) risks.push(risk);
  }
  const { projectState } = data.answers;
  if (projectState === "existing" || projectState === "migration") risks.push(copy.risks.existing);
  if (unknowns >= 3) risks.push(copy.risks.unknowns(unknowns));
  return risks;
}

export function createRuleBasedAnalyzer(copy: ProjectCopy, engine: EngineCopy): InterviewAnalyzer {
  return {
    analyze(data) {
      const name = projectName(data.answers, engine) ?? engine.recommend.customProject;
      const conflicts = detectConflicts(data, copy, engine);
      const openQuestions = detectOpenQuestions(data, copy);
      const assumptions = detectAssumptions(data, copy, engine);
      const requirements = buildRequirements(
        data,
        copy,
        engine,
        name,
        openQuestions,
        conflicts,
        assumptions,
      );
      const counts = { confirmed: 0, inferred: 0, unknown: 0, conflicting: 0 };
      for (const r of requirements) counts[r.status] += 1;
      return {
        name,
        requirements,
        conflicts,
        openQuestions,
        assumptions,
        risks: detectRisks(data, copy, openQuestions.length),
        complexity: complexityOf(data.answers, engine),
        counts,
      };
    },
  };
}
