import type { DeliveryStep } from "@/lib/domain/delivery";

/** How the project's tasks stand: the plan the three questions are checked against. */
export interface TaskCounts {
  total: number;
  done: number;
  /** In review: finished by the doer, not yet checked. */
  review: number;
  /** Not started, in progress or blocked. */
  open: number;
}

export type DeliveryNote =
  /** Answered yes while tasks are still open. */
  | { step: "build"; code: "open_tasks"; count: number }
  /** Answered yes while tasks still wait for review. */
  | { step: "review"; code: "tasks_in_review"; count: number }
  /** Reviewed, but build is not answered yes. */
  | { step: "review"; code: "needs_build" }
  /** Answered yes before build and review are. */
  | { step: "deploy"; code: "needs_build_and_review" }
  /** Every task is done but the question is not answered yes: ask for the answer. */
  | { step: "build"; code: "all_tasks_done" };

interface Answer {
  step: DeliveryStep;
  done: boolean;
  unanswered: boolean;
}

const yes = (answers: Answer[], step: DeliveryStep) =>
  answers.some((a) => a.step === step && !a.unanswered && a.done);

/**
 * Where the answers and the plan disagree. Advice only: a person may know better than the task
 * list (a task left open on purpose), so nothing here blocks an answer.
 */
export function deliveryNotes(answers: Answer[], counts: TaskCounts): DeliveryNote[] {
  const notes: DeliveryNote[] = [];
  if (yes(answers, "build") && counts.open > 0)
    notes.push({ step: "build", code: "open_tasks", count: counts.open });
  if (!yes(answers, "build") && counts.total > 0 && counts.done === counts.total)
    notes.push({ step: "build", code: "all_tasks_done" });
  if (yes(answers, "review") && counts.review > 0)
    notes.push({ step: "review", code: "tasks_in_review", count: counts.review });
  if (yes(answers, "review") && !yes(answers, "build"))
    notes.push({ step: "review", code: "needs_build" });
  if (yes(answers, "deploy") && !(yes(answers, "build") && yes(answers, "review")))
    notes.push({ step: "deploy", code: "needs_build_and_review" });
  return notes;
}

/** The latest answer per step; null where nobody has answered. */
export type Answers = Record<DeliveryStep, boolean | null>;

export const NO_ANSWERS: Answers = { build: null, review: null, deploy: null };

/** Notes that say two answers disagree with each other, not with the plan. */
export const CONTRADICTION_CODES = ["needs_build", "needs_build_and_review"] as const;

/**
 * Whether the answers disagree with each other: reviewed but not built, or deployed before both.
 * Each answer is recorded on its own, so this is advice for the team, never a rule.
 */
export function answersContradict(a: Answers): boolean {
  if (a.review === true && a.build !== true) return true;
  return a.deploy === true && !(a.build === true && a.review === true);
}

export interface TaskAdjustment {
  /** Open tasks that move to review: the work is built, a person still has to check it. */
  toReview: number;
  /** Tasks that move to done: the work was reviewed. */
  toDone: number;
}

/**
 * What one answer says about the plan: reviewed means every task is done; built means the open
 * ones now wait for review. Only forward, never back: a task is not reopened by an answer, and
 * "not yet" or a deploy answer moves nothing.
 */
export function planTaskAdjustment(
  step: DeliveryStep,
  done: boolean,
  counts: TaskCounts,
): TaskAdjustment {
  if (!done) return { toReview: 0, toDone: 0 };
  if (step === "review") return { toReview: 0, toDone: counts.total - counts.done };
  if (step === "build") return { toReview: counts.open, toDone: 0 };
  return { toReview: 0, toDone: 0 };
}
