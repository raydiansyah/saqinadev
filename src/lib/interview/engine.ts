import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { toMarkdownBrief } from "./brief";
import { classify } from "./classify";
import { type EngineCopy, getEngineCopy } from "./copy";
import { getInsights } from "./rules/insights";
import { normalizeSelection } from "./rules/landing";
import { previewProject } from "./rules/preview";
import { recommend, suggestFeatures } from "./rules/recommend";
import { isStepComplete, nextStep, previousStep, visibleSteps } from "./rules/visibility";
import type {
  Answers,
  Classification,
  Insight,
  LandingSelection,
  ProjectPreview,
  Recommendation,
  StepId,
} from "./types";

/**
 * Contract between the interview UI and whatever reasons about the answers.
 * Phase 1 ships a deterministic rule engine; a model-backed engine can implement
 * the same interface later without touching the UI.
 */
export interface InterviewEngine {
  /** Language of every string the engine returns. */
  locale: Locale;
  copy: EngineCopy;
  steps(answers: Answers): StepId[];
  isComplete(step: StepId, answers: Answers): boolean;
  next(current: StepId, answers: Answers, returnToReview?: boolean): StepId;
  previous(current: StepId, answers: Answers): StepId | null;
  classify(text: string): Classification;
  insights(answers: Answers): Insight[];
  suggestFeatures(answers: Answers): Answers["features"];
  normalizeLanding(selection: LandingSelection): LandingSelection;
  recommend(answers: Answers): Recommendation;
  /** Live, partial picture of the project while answers come in. */
  preview(answers: Answers): ProjectPreview;
  brief(rec: Recommendation): string;
}

export function createRuleBasedEngine(locale: Locale = DEFAULT_LOCALE): InterviewEngine {
  const copy = getEngineCopy(locale);
  return {
    locale,
    copy,
    steps: visibleSteps,
    isComplete: isStepComplete,
    next: nextStep,
    previous: previousStep,
    classify,
    insights: (answers) => getInsights(answers, copy),
    suggestFeatures,
    normalizeLanding: normalizeSelection,
    recommend: (answers) => recommend(answers, copy),
    preview: (answers) => previewProject(answers, copy),
    brief: (rec) => toMarkdownBrief(rec, copy),
  };
}
