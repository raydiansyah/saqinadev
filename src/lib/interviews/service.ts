import "server-only";
import { eq } from "drizzle-orm";
import { isLocale } from "@/i18n/locales";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { persistGeneratedProject } from "@/lib/projects/persist";
import { parse } from "@/lib/validation";
import { createProjectIntelligence } from "./intelligence";
import { type InterviewData, type InterviewStep, isInterviewStep, type QuestionKey } from "./model";
import {
  confirmAnswers,
  findLatestInterview,
  markInterviewCompleted,
  readInterviewData,
  updateInterviewProgress,
  writeAnswers,
} from "./repository";
import { saveAnswersInput } from "./validators";

export interface InterviewState {
  data: InterviewData;
  step: InterviewStep;
  completedSteps: InterviewStep[];
  status: "in_progress" | "completed";
  lastSavedAt: Date;
}

async function interviewFor(tx: Tx | typeof db, projectId: string) {
  const interview = await findLatestInterview(tx, projectId);
  if (!interview) throw new AppError("NOT_FOUND", "Interview missing");
  return interview;
}

export async function getInterviewState(actor: Actor, slug: string): Promise<InterviewState> {
  const { project } = await loadProjectAccess(actor, { slug }, "project:read");
  const interview = await interviewFor(db, project.id);
  return {
    data: await readInterviewData(db, interview.id),
    step: isInterviewStep(interview.currentStep) ? interview.currentStep : "project",
    completedSteps: interview.completedSteps.filter(isInterviewStep),
    status: interview.status,
    lastSavedAt: interview.lastSavedAt,
  };
}

/**
 * Autosave. Accepts a partial patch of validated answers; anything the user touches becomes
 * a user answer. Completed interviews are read-only so the workspace cannot drift silently.
 */
export async function saveAnswers(actor: Actor, input: unknown): Promise<{ savedAt: Date }> {
  const { slug, patch, step, confirm } = parse(saveAnswersInput, input);
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const interview = await interviewFor(tx, project.id);
    if (interview.status === "completed")
      throw new AppError("CONFLICT", "Interview already completed");

    await writeAnswers(tx, interview.id, patch, "user");
    await confirmAnswers(tx, interview.id, confirm as QuestionKey[]);
    const completed = Array.from(
      new Set([...interview.completedSteps, interview.currentStep]),
    ).filter((s) => s !== step);
    const savedAt = await updateInterviewProgress(tx, interview.id, step, completed);

    if (typeof patch.projectType !== "undefined") {
      await tx.update(projects).set({ type: patch.projectType }).where(eq(projects.id, project.id));
    }
    return { savedAt };
  });
}

/**
 * Finishes the interview and creates the workspace: requirements, recommendations, PRD,
 * plan, tasks, memory, decisions and agents, all in one transaction.
 * Refuses while conflicts are unresolved: the user decides, never the system.
 */
export async function completeInterview(actor: Actor, slug: string): Promise<{ slug: string }> {
  return db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const interview = await interviewFor(tx, project.id);
    if (interview.status === "completed") return { slug };

    const data = await readInterviewData(tx, interview.id);
    if (!data.answers.projectType && data.answers.projectDescription.trim().length < 10) {
      throw new AppError("VALIDATION_ERROR", "Project idea missing", { project: "required" });
    }
    const locale = isLocale(project.locale) ? project.locale : "en";
    const intelligence = createProjectIntelligence(locale);
    const { analysis, recommendation, project: generated } = intelligence.generate(data);
    if (analysis.conflicts.length > 0) {
      throw new AppError("CONFLICT", "Unresolved conflicts", { conflicts: "unresolved" });
    }

    await persistGeneratedProject(tx, {
      project,
      actorId: actor.id,
      generated,
      recommendation,
      complexity: analysis.complexity.level,
      platform: data.details.platforms.join("+") || null,
      buildStrategy: recommendation.base.development.value,
      data,
      gen: intelligence.gen,
    });
    await markInterviewCompleted(tx, interview.id);
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "interview.completed",
      entityType: "interview",
      entityId: interview.id,
      metadata: {
        confirmed: analysis.counts.confirmed,
        inferred: analysis.counts.inferred,
        unknown: analysis.counts.unknown,
      },
    });
    return { slug };
  });
}
