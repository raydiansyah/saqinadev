import { defaultCopy, type EngineCopy } from "../copy";
import { type FeatureId, type ProjectTypeId, STACK_LAYERS } from "../options";
import { nameFromText } from "../profiles";
import type { Answers, Reasoned, Recommendation } from "../types";
import { structureLabel } from "./insights";
import { recommendLanding } from "./landing";
import { complexityOf, isSimpleSite, needsData, slugify } from "./profile";

/** Typical feature sets, offered when the user answers "I don't know yet". */
const FEATURES_BY_TYPE: Record<ProjectTypeId, FeatureId[]> = {
  "school-website": ["search", "file-upload", "notification"],
  "company-profile": ["search"],
  pos: ["auth", "pos", "inventory", "reports", "rbac"],
  marketplace: ["auth", "search", "filter", "payment", "chat", "notification", "rbac"],
  saas: ["auth", "dashboard", "crud", "payment", "notification", "rbac", "multi-tenant"],
  "internal-dashboard": ["auth", "dashboard", "crud", "reports", "rbac"],
  "mobile-backend": ["auth", "api", "crud", "notification", "file-upload"],
  "ai-application": ["auth", "ai", "file-upload", "dashboard"],
  portfolio: ["file-upload"],
  booking: ["auth", "booking", "notification", "payment", "dashboard"],
  ecommerce: ["auth", "search", "filter", "payment", "inventory", "notification"],
  "learning-platform": ["auth", "dashboard", "file-upload", "reports", "rbac", "notification"],
  custom: ["auth", "dashboard", "crud"],
};

export function suggestFeatures(answers: Answers): FeatureId[] {
  const base = FEATURES_BY_TYPE[answers.projectType ?? "custom"];
  return base.filter((f) => !answers.features.includes(f));
}

/** One project name for every surface: live stage, review, brief and file name. */
export function projectName(answers: Answers, copy: EngineCopy = defaultCopy): string | null {
  return (
    structureLabel(answers, copy) ??
    nameFromText(answers, copy) ??
    (answers.projectType ? copy.options.projectType[answers.projectType].label : null)
  );
}

const hasExistingCode = (answers: Answers) =>
  answers.projectState === "existing" || answers.projectState === "migration";

function recommendDevelopment(
  answers: Answers,
  complexity: string,
  copy: EngineCopy,
): Reasoned<"saqina" | "external"> {
  const t = copy.recommend.development;
  if (answers.developmentMode === "saqina" || answers.developmentMode === "external") {
    return {
      value: answers.developmentMode,
      chosen: true,
      reason: answers.developmentMode === "saqina" ? t.chosenSaqina : t.chosenExternal,
    };
  }
  if (hasExistingCode(answers)) return { value: "external", chosen: false, reason: t.existingCode };
  if (complexity === "high") return { value: "external", chosen: false, reason: t.large };
  return { value: "saqina", chosen: false, reason: t.small };
}

function recommendAgent(
  answers: Answers,
  mode: "saqina" | "external",
  copy: EngineCopy,
): Reasoned<string> | null {
  if (mode !== "external") return null;
  const t = copy.recommend.agent;
  if (answers.agent && answers.agent !== "unsure") {
    return { value: copy.options.agent[answers.agent].label, chosen: true, reason: t.chosen };
  }
  return hasExistingCode(answers)
    ? { value: "Claude", chosen: false, reason: t.existingCode }
    : { value: "Cursor", chosen: false, reason: t.newProject };
}

function recommendStack(
  answers: Answers,
  copy: EngineCopy,
): Reasoned<{ layer: string; value: string }[]> {
  const t = copy.recommend.stack;
  if (answers.techPreference === "own") {
    const items = STACK_LAYERS.filter((l) => answers.ownStack[l].trim()).map((l) => ({
      layer: copy.options.stackLayer[l].label,
      value: answers.ownStack[l].trim(),
    }));
    return { value: items, chosen: true, reason: t.own };
  }

  if (isSimpleSite(answers)) {
    return {
      chosen: false,
      reason: t.simple,
      value: [
        { layer: t.layers.frontend, value: t.staticPages },
        { layer: t.layers.styling, value: "Tailwind CSS" },
        { layer: t.layers.content, value: t.markdown },
      ],
    };
  }

  const items =
    answers.projectType === "mobile-backend"
      ? [{ layer: t.layers.api, value: t.apiValue }]
      : [
          { layer: t.layers.frontend, value: "Next.js + TypeScript" },
          { layer: t.layers.styling, value: "Tailwind CSS" },
        ];
  if (needsData(answers)) items.push({ layer: t.layers.database, value: "PostgreSQL (Supabase)" });
  if (answers.features.includes("auth") || needsData(answers)) {
    items.push({ layer: t.layers.auth, value: "Supabase Auth" });
  }
  if (answers.features.includes("ai") || answers.projectType === "ai-application") {
    items.push({ layer: t.layers.ai, value: t.aiValue });
  }
  return { value: items, chosen: false, reason: t.app };
}

function recommendDatabase(answers: Answers, copy: EngineCopy): Reasoned<string> {
  const t = copy.recommend.database;
  if (isSimpleSite(answers) || answers.databaseNeed === "no") {
    return {
      value: t.notRequired,
      chosen: answers.databaseNeed === "no",
      reason: t.notRequiredReason,
    };
  }
  const choice = answers.databaseChoice;
  if (answers.databaseNeed === "yes" && choice && choice !== "recommend") {
    return {
      value: choice === "existing" ? t.existing : copy.options.databaseChoice[choice].label,
      chosen: true,
      reason: t.yourChoice,
    };
  }
  if (answers.databaseNeed === "unsure" && !needsData(answers)) {
    return { value: t.notYet, chosen: false, reason: t.notYetReason };
  }
  return { value: t.recommended, chosen: false, reason: t.recommendedReason };
}

function recommendDeployment(answers: Answers, slug: string, copy: EngineCopy) {
  const t = copy.recommend.deployment;
  const target = answers.deployment;
  const chosen = !!target && target !== "unsure";
  const value = chosen ? copy.options.deployment[target].label : t.defaultTarget;
  const viaVercel = !chosen || target === "saqina-vercel" || target === "existing-vercel";
  return {
    value,
    chosen,
    viaVercel,
    reason: viaVercel ? t.viaVercel : t.otherHost,
    steps: viaVercel
      ? [
          target === "existing-vercel" ? t.connectVercel : t.createVercel,
          t.preview,
          t.production,
          `${slug}.saqina.dev`,
          t.customDomain,
        ]
      : [t.build, t.env, t.deployHost, t.customDomain],
  };
}

function recommendVersioning(
  answers: Answers,
  complexity: string,
  copy: EngineCopy,
): Reasoned<boolean> | null {
  if (isSimpleSite(answers)) return null;
  if (answers.versioning === "yes" || answers.versioning === "no") {
    return {
      value: answers.versioning === "yes",
      chosen: true,
      reason: copy.recommend.database.yourChoice,
    };
  }
  const t = copy.recommend.versioning;
  const hasConsumers = answers.features.includes("api") || answers.projectType === "mobile-backend";
  const hasReleases = hasConsumers || complexity !== "low";
  return {
    value: hasReleases,
    chosen: false,
    reason: hasConsumers ? t.consumers : hasReleases ? t.releases : t.small,
  };
}

export function recommend(answers: Answers, copy: EngineCopy = defaultCopy): Recommendation {
  const projectLabel = projectName(answers, copy) ?? copy.recommend.customProject;
  // The slug becomes a subdomain, so it must not change when the visitor switches language.
  const slug = slugify(projectName(answers, defaultCopy) ?? defaultCopy.recommend.customProject);
  const complexity = complexityOf(answers, copy);
  const development = recommendDevelopment(answers, complexity.level, copy);

  const integrations = ["Git", "CI/CD"];
  if (development.value === "external") integrations.push(copy.recommend.integrations.mcp);
  const database = recommendDatabase(answers, copy);
  if (database.value.includes("Supabase")) integrations.push("Supabase");
  const { viaVercel, ...deployment } = recommendDeployment(answers, slug, copy);
  if (viaVercel) integrations.push("Vercel");
  integrations.push(copy.recommend.integrations.customDomain);

  return {
    projectLabel,
    slug,
    objective: answers.objective.trim(),
    audience: answers.audience.map((a) => copy.options.audience[a].label),
    features: {
      selected: answers.features,
      suggested: answers.featuresUnknown ? suggestFeatures(answers) : [],
    },
    complexity,
    projectState: answers.projectState
      ? copy.options.projectState[answers.projectState].label
      : copy.recommend.newProject,
    development,
    agent: recommendAgent(answers, development.value, copy),
    stack: recommendStack(answers, copy),
    database,
    deployment,
    versioning: recommendVersioning(answers, complexity.level, copy),
    landing: recommendLanding(answers, copy),
    futureIntegrations: integrations,
  };
}
