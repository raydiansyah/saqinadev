import {
  isConcept,
  type LandingConceptId,
  MAX_SUPPORTING_CONCEPTS,
} from "@/content/landing-concepts";
import { defaultCopy, type EngineCopy } from "../copy";
import type { ProjectTypeId } from "../options";
import type { Answers, LandingRecommendation, LandingSelection } from "../types";
import { complexityOf, hasPublicLanding, isPhysicalProduct, isSimpleSite } from "./profile";

type ConceptList = [LandingConceptId, ...LandingConceptId[]];

/** Starting points per project type (master prompt mapping). Recommendations, not absolute rules. */
const BY_TYPE: Record<ProjectTypeId, ConceptList> = {
  saas: ["product-led", "dashboard-journey", "interactive-demo"],
  "internal-dashboard": ["dashboard-journey", "product-led"],
  "learning-platform": ["product-led", "dashboard-journey", "interactive-demo"],
  "ai-application": ["file-to-result", "data-viz-narrative", "interactive-demo"],
  portfolio: ["cinematic-scroll", "guided-narrative", "before-after"],
  "company-profile": ["conversion-minimal", "product-led", "performance-seo"],
  "school-website": ["guided-narrative", "performance-seo"],
  pos: ["product-led", "interactive-demo", "feature-choreography"],
  marketplace: ["conversion-minimal", "product-led", "performance-seo"],
  ecommerce: ["conversion-minimal", "performance-seo"],
  booking: ["conversion-minimal", "interactive-demo"],
  "mobile-backend": ["system-map", "product-led"],
  custom: ["conversion-minimal", "product-led", "performance-seo"],
};

/** An accepted business application is sold on its workflows, like a SaaS. */
const BUSINESS_APP_CONCEPTS: ConceptList = ["product-led", "dashboard-journey", "interactive-demo"];

/** Enforces: exactly 1 primary, at most 2 supporting, no duplicates. */
export function normalizeSelection(selection: LandingSelection): LandingSelection {
  const supporting = [...new Set(selection.supporting)]
    .filter((id) => id !== selection.primary && isConcept(id))
    .slice(0, MAX_SUPPORTING_CONCEPTS);
  return { primary: selection.primary, supporting };
}

export function recommendLanding(
  answers: Answers,
  copy: EngineCopy = defaultCopy,
): LandingRecommendation | null {
  if (!answers.projectType && !answers.projectDescription.trim()) return null;
  if (!hasPublicLanding(answers)) return null;

  const type = answers.projectType ?? "custom";
  const businessApp = answers.structure === "business-app";
  let [primary, ...supporting] = businessApp ? BUSINESS_APP_CONCEPTS : BY_TYPE[type];
  const reasons = [businessApp ? copy.landing.businessApp : copy.landing.why[type]];

  // Integration-heavy products are explained best as a map of connections.
  if (
    answers.features.includes("integration") &&
    answers.features.includes("api") &&
    primary !== "system-map"
  ) {
    supporting = [primary, ...supporting];
    primary = "system-map";
    reasons.push(copy.landing.integration);
  }

  // 3D only when shape and space explain the product, never as decoration.
  const physical = isPhysicalProduct(answers);
  if (physical) {
    primary = "product-3d";
    supporting = ["pinned-stage", "cinematic-scroll"];
    reasons.push(copy.landing.physical);
  }

  // Simple sites stay simple: one supporting concept at most.
  const limit =
    !physical && (isSimpleSite(answers) || complexityOf(answers).level === "low") ? 1 : 2;
  const normalized = normalizeSelection({ primary, supporting: supporting.slice(0, limit) });

  if (answers.landing) {
    const override = normalizeSelection(answers.landing);
    return {
      ...override,
      reason: copy.landing.override(copy.concepts[normalized.primary].name, reasons[0]),
      overridden: true,
    };
  }

  return { ...normalized, reason: reasons.join(" "), overridden: false };
}
