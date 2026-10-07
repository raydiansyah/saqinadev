import { type Answers, STEPS, type StepId } from "../types";
import { hasPublicLanding, isSimpleSite } from "./profile";

/**
 * Which steps are relevant for the current answers. Irrelevant questions are skipped,
 * e.g. a simple company profile never gets asked about databases or versioning.
 */
export function isStepVisible(step: StepId, answers: Answers): boolean {
  switch (step) {
    case "database":
    case "versioning":
      return !isSimpleSite(answers);
    case "agent":
      return answers.developmentMode === "external";
    case "landing":
      return hasPublicLanding(answers);
    default:
      return true;
  }
}

export function visibleSteps(answers: Answers): StepId[] {
  return STEPS.filter((step) => isStepVisible(step, answers));
}

/** Whether a step has enough input to move forward. */
export function isStepComplete(step: StepId, answers: Answers): boolean {
  switch (step) {
    case "project":
      return !!answers.projectType || answers.projectDescription.trim().length >= 10;
    case "audience":
      return answers.audience.length > 0;
    case "objective":
      return answers.objective.trim().length >= 10;
    case "features":
      return answers.features.length > 0 || answers.featuresUnknown;
    case "existing":
      return !!answers.projectState;
    case "technology":
      if (!answers.techPreference) return false;
      if (answers.techPreference !== "own") return true;
      return Object.values(answers.ownStack).some((v) => v.trim().length > 0);
    case "database":
      if (!answers.databaseNeed) return false;
      return answers.databaseNeed !== "yes" || !!answers.databaseChoice;
    case "development":
      return !!answers.developmentMode;
    case "agent":
      return !!answers.agent;
    case "deployment":
      return !!answers.deployment;
    case "versioning":
      return !!answers.versioning;
    case "landing":
    case "review":
      return true;
  }
}

export function nextStep(current: StepId, answers: Answers, returnToReview = false): StepId {
  const steps = visibleSteps(answers);
  const after = STEPS.slice(STEPS.indexOf(current) + 1).filter((s) => steps.includes(s));
  if (returnToReview) {
    // After an edit, only stop at steps the edit made newly required.
    return after.find((s) => !isStepComplete(s, answers)) ?? "review";
  }
  return after[0] ?? "review";
}

export function previousStep(current: StepId, answers: Answers): StepId | null {
  const steps = visibleSteps(answers);
  const before = STEPS.slice(0, STEPS.indexOf(current)).filter((s) => steps.includes(s));
  return before.at(-1) ?? null;
}
