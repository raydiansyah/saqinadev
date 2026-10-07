import { classify } from "../classify";
import { defaultCopy, type EngineCopy } from "../copy";
import type { FeatureId, ProjectTypeId } from "../options";
import type { Answers, Complexity } from "../types";

/** Shared derived facts about a project, used by visibility, insights and recommendations. */

export const CONTENT_SITE_TYPES: ProjectTypeId[] = [
  "company-profile",
  "portfolio",
  "school-website",
];

/** Features that turn a content site into a web application. */
export const APP_FEATURES: FeatureId[] = [
  "auth",
  "dashboard",
  "crud",
  "payment",
  "chat",
  "booking",
  "inventory",
  "pos",
  "multi-tenant",
  "rbac",
  "api",
];

/** Features that cannot work without persistent storage. */
export const DATA_FEATURES: FeatureId[] = [
  "auth",
  "crud",
  "payment",
  "chat",
  "booking",
  "inventory",
  "pos",
  "multi-tenant",
  "rbac",
  "reports",
  "analytics",
];

export const DATA_HEAVY_TYPES: ProjectTypeId[] = [
  "pos",
  "marketplace",
  "saas",
  "internal-dashboard",
  "mobile-backend",
  "booking",
  "ecommerce",
  "learning-platform",
];

const HEAVY_FEATURES: FeatureId[] = [
  "payment",
  "multi-tenant",
  "ai",
  "maps",
  "chat",
  "integration",
  "pos",
  "inventory",
];

export function appFeaturesIn(answers: Answers): FeatureId[] {
  return answers.features.filter((f) => APP_FEATURES.includes(f));
}

export function isContentSite(answers: Answers): boolean {
  return !!answers.projectType && CONTENT_SITE_TYPES.includes(answers.projectType);
}

/** A content site with no app features and no accepted portal structure. */
export function isSimpleSite(answers: Answers): boolean {
  return isContentSite(answers) && appFeaturesIn(answers).length === 0 && !answers.structure;
}

export function needsData(answers: Answers): boolean {
  return (
    (!!answers.projectType && DATA_HEAVY_TYPES.includes(answers.projectType)) ||
    answers.features.some((f) => DATA_FEATURES.includes(f))
  );
}

export function hasPublicLanding(answers: Answers): boolean {
  return answers.projectType !== "internal-dashboard" && answers.projectType !== "mobile-backend";
}

export function isPhysicalProduct(answers: Answers): boolean {
  return classify(`${answers.projectDescription} ${answers.objective}`).physical;
}

export function complexityOf(
  answers: Answers,
  copy: EngineCopy = defaultCopy,
): { level: Complexity; reason: string } {
  if (isSimpleSite(answers)) return { level: "low", reason: copy.complexity.simple };
  const heavy = answers.features.filter((f) => HEAVY_FEATURES.includes(f));
  const score = answers.features.length + heavy.length * 2 + (needsData(answers) ? 2 : 0);
  if (score >= 13 || heavy.length >= 3) {
    const names = heavy.map((f) => copy.options.feature[f].label.toLowerCase());
    return { level: "high", reason: copy.complexity.high(copy.joinList(names)) };
  }
  if (score >= 4) return { level: "medium", reason: copy.complexity.medium };
  return { level: "low", reason: copy.complexity.low };
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug || "your-project";
}
