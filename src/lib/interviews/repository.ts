import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { interviewAnswers, interviews } from "@/lib/db/schema";
import type { AnswerSource } from "@/lib/domain/enums";
import { EMPTY_ANSWERS } from "@/lib/interview/types";
import {
  ANSWER_KEYS,
  EMPTY_DETAILS,
  EMPTY_INTERVIEW,
  type InterviewData,
  type QuestionKey,
} from "./model";

export type InterviewRow = typeof interviews.$inferSelect;

export async function findLatestInterview(
  executor: Executor,
  projectId: string,
): Promise<InterviewRow | undefined> {
  const [row] = await executor
    .select()
    .from(interviews)
    .where(eq(interviews.projectId, projectId))
    .orderBy(desc(interviews.startedAt))
    .limit(1);
  return row;
}

export async function insertInterview(
  executor: Executor,
  projectId: string,
): Promise<InterviewRow> {
  const [row] = await executor.insert(interviews).values({ projectId }).returning();
  return row;
}

const answerType = (value: unknown) =>
  typeof value === "string"
    ? "text"
    : Array.isArray(value)
      ? "multi"
      : value !== null && typeof value === "object"
        ? "object"
        : "choice";

/**
 * Upserts answer rows. `null` clears an answer (the row is deleted) so "not answered" stays
 * distinguishable from an empty choice.
 */
export async function writeAnswers(
  executor: Executor,
  interviewId: string,
  patch: Partial<Record<QuestionKey, unknown>>,
  source: AnswerSource,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
    QuestionKey,
    unknown,
  ][];
  const cleared = entries.filter(([, v]) => v === null).map(([k]) => k);
  const values = entries
    .filter(([, v]) => v !== null)
    .map(([questionKey, answer]) => ({
      interviewId,
      questionKey,
      answer,
      answerType: answerType(answer) as "text" | "choice" | "multi" | "object",
      source,
      confidence: (source === "inferred" ? "medium" : "high") as "medium" | "high",
    }));

  if (cleared.length > 0) {
    await executor
      .delete(interviewAnswers)
      .where(
        and(
          eq(interviewAnswers.interviewId, interviewId),
          inArray(interviewAnswers.questionKey, cleared),
        ),
      );
  }
  if (values.length > 0) {
    await executor
      .insert(interviewAnswers)
      .values(values)
      .onConflictDoUpdate({
        target: [interviewAnswers.interviewId, interviewAnswers.questionKey],
        set: {
          answer: sql`excluded.answer`,
          answerType: sql`excluded.answer_type`,
          source: sql`excluded.source`,
          confidence: sql`excluded.confidence`,
          updatedAt: new Date(),
        },
      });
  }
}

/** Marks keys as confirmed by the user without changing their values. */
export async function confirmAnswers(executor: Executor, interviewId: string, keys: QuestionKey[]) {
  if (keys.length === 0) return;
  await executor
    .update(interviewAnswers)
    .set({ source: "user", confidence: "high", updatedAt: new Date() })
    .where(
      and(
        eq(interviewAnswers.interviewId, interviewId),
        inArray(interviewAnswers.questionKey, keys),
      ),
    );
}

/** Rebuilds the interview model from stored rows; unknown or stale keys are ignored. */
export async function readInterviewData(
  executor: Executor,
  interviewId: string,
): Promise<InterviewData> {
  const rows = await executor
    .select()
    .from(interviewAnswers)
    .where(eq(interviewAnswers.interviewId, interviewId));

  const data: InterviewData = structuredClone(EMPTY_INTERVIEW);
  const answers: Record<string, unknown> = { ...EMPTY_ANSWERS };
  for (const row of rows) {
    const key = row.questionKey as QuestionKey;
    if ((ANSWER_KEYS as readonly string[]).includes(key)) answers[key] = row.answer;
    else if (key === "details") data.details = { ...EMPTY_DETAILS, ...(row.answer as object) };
    else if (key === "overrides") data.overrides = row.answer as InterviewData["overrides"];
    else if (key === "resolutions") data.resolutions = row.answer as InterviewData["resolutions"];
    else if (key === "keptUnresolved") data.keptUnresolved = row.answer as string[];
    else continue;
    if (row.source !== "user") data.sources[key] = row.source;
  }
  data.answers = answers as unknown as InterviewData["answers"];
  return data;
}

export async function updateInterviewProgress(
  executor: Executor,
  interviewId: string,
  step: string,
  completedSteps: string[],
): Promise<Date> {
  const now = new Date();
  await executor
    .update(interviews)
    .set({ currentStep: step, completedSteps, lastSavedAt: now })
    .where(eq(interviews.id, interviewId));
  return now;
}

export async function markInterviewCompleted(executor: Executor, interviewId: string) {
  const now = new Date();
  await executor
    .update(interviews)
    .set({ status: "completed", completedAt: now, currentStep: "review", lastSavedAt: now })
    .where(eq(interviews.id, interviewId));
}
