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
  if (yes(answers, "deploy") && !(yes(answers, "build") && yes(answers, "review")))
    notes.push({ step: "deploy", code: "needs_build_and_review" });
  return notes;
}
