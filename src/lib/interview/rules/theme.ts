import { THEME_TIER, type UiThemeId } from "@/content/ui-themes";
import { defaultCopy, type EngineCopy } from "../copy";
import type { ProjectTypeId } from "../options";
import type { Answers, ThemeRecommendation } from "../types";

type ThemeList = [UiThemeId, ...UiThemeId[]];

/**
 * Starting points per project type. Only recommended or available themes appear here:
 * a concept theme is expressive and is only ever chosen by the user.
 */
const BY_TYPE: Record<ProjectTypeId, ThemeList> = {
  saas: ["modern-dark", "software", "professional"],
  "internal-dashboard": ["software", "professional", "modern-dark"],
  "learning-platform": ["botanical", "professional", "software"],
  "ai-application": ["modern-dark", "financial", "software"],
  portfolio: ["swiss-minimalist", "luxury", "monochrome"],
  "company-profile": ["professional", "swiss-minimalist", "luxury"],
  "school-website": ["botanical", "professional", "software"],
  pos: ["software", "professional", "modern-dark"],
  marketplace: ["software", "luxury", "professional"],
  ecommerce: ["software", "luxury", "swiss-minimalist"],
  booking: ["professional", "botanical", "software"],
  "mobile-backend": ["software", "professional"],
  custom: ["professional", "software", "modern-dark"],
};

/** Whether the project has data screens (dashboard, reports, analytics) that stress a theme. */
export function hasDataScreens(answers: Answers): boolean {
  return (
    answers.projectType === "internal-dashboard" ||
    answers.features.some((f) => f === "dashboard" || f === "reports" || f === "analytics")
  );
}

/** Whether the project has an interface worth styling. */
export function hasInterface(answers: Answers): boolean {
  return answers.projectType !== "mobile-backend";
}

export function recommendTheme(
  answers: Answers,
  copy: EngineCopy = defaultCopy,
): ThemeRecommendation | null {
  if (!answers.projectType && !answers.projectDescription.trim()) return null;
  if (!hasInterface(answers)) return null;

  const type = answers.projectType ?? "custom";
  const [suggested, ...others] = BY_TYPE[type];
  const reason = copy.theme.why[type];

  if (answers.theme && answers.theme !== suggested) {
    return {
      primary: answers.theme,
      alternatives: [suggested, ...others].filter((id) => id !== answers.theme),
      reason: copy.theme.override(copy.themes[suggested].name, reason),
      overridden: true,
    };
  }
  return { primary: suggested, alternatives: others, reason, overridden: false };
}

/** Safety net for the data table: recommendations never point at a concept theme. */
export function isAutoRecommendable(id: UiThemeId): boolean {
  return THEME_TIER[id] !== "concept";
}
