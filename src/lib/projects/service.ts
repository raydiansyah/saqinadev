import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { activities, projectMembers, projectSettings, projects } from "@/lib/db/schema";
import {
  BUILD_STRATEGIES,
  DEPLOY_PROVIDERS,
  PROJECT_STATUSES,
  type ProjectStatus,
  REPO_PROVIDERS,
} from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { classify } from "@/lib/interview/classify";
import { getEngineCopy } from "@/lib/interview/copy";
import { slugify } from "@/lib/interview/rules/profile";
import { projectName } from "@/lib/interview/rules/recommend";
import { EMPTY_ANSWERS } from "@/lib/interview/types";
import { insertInterview, writeAnswers } from "@/lib/interviews/repository";
import { importedAnswersInput } from "@/lib/interviews/validators";
import { parse } from "@/lib/validation";
import { getNextProjectAction, type NextAction, type ProjectSnapshot } from "./progress";
import { listMemberProjects, loadSnapshots, type ProjectRow, slugExists } from "./repository";

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

/** "restaurant-pos-k3x9": readable, unique, and not a database id. */
async function uniqueSlug(name: string, executor = db): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${randomSuffix()}`;
    if (!(await slugExists(executor, slug))) return slug;
  }
  throw new AppError("CONFLICT", "Could not allocate a project slug");
}

const startInput = z.object({
  idea: z.string().trim().min(10).max(2000),
  imported: importedAnswersInput.optional(),
});

/**
 * Creates a draft project with its interview. Words in the idea are read by the classifier;
 * what it finds is stored as inferred, never as confirmed.
 */
export async function startProject(
  actor: Actor,
  input: unknown,
  locale: Locale,
  options: { isDemo?: boolean } = {},
): Promise<{ slug: string }> {
  const { idea, imported } = parse(startInput, input);
  const found = classify(idea);
  const answers = { ...EMPTY_ANSWERS, projectDescription: idea, projectType: found.projectType };
  const name =
    projectName(answers, getEngineCopy(locale)) ?? idea.split(/\s+/).slice(0, 4).join(" ");

  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(name, tx);
    const [project] = await tx
      .insert(projects)
      .values({
        slug,
        ownerId: actor.id,
        name,
        description: idea,
        type: found.projectType ?? null,
        status: "interview",
        locale,
        isDemo: options.isDemo ?? false,
      })
      .returning();
    await tx
      .insert(projectMembers)
      .values({ projectId: project.id, userId: actor.id, role: "owner" });
    await tx.insert(projectSettings).values({ projectId: project.id });

    const interview = await insertInterview(tx, project.id);
    await writeAnswers(tx, interview.id, { projectDescription: idea }, "user");
    await writeAnswers(
      tx,
      interview.id,
      {
        projectType: found.projectType,
        features: found.features.length > 0 ? found.features : undefined,
        audience: found.audience.length > 0 ? found.audience : undefined,
      },
      "inferred",
    );

    // Answers from the public preview: kept, but marked as imported rather than confirmed.
    if (imported) {
      const { projectDescription: _ignored, ...rest } = imported;
      await writeAnswers(tx, interview.id, rest, "imported");
      if (rest.projectType) {
        await tx
          .update(projects)
          .set({ type: rest.projectType })
          .where(eq(projects.id, project.id));
      }
    }

    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "project.created",
      entityType: "project",
      entityId: project.id,
      metadata: { name },
    });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "interview.started",
      entityType: "interview",
      entityId: interview.id,
    });
    return { slug };
  });
}

export interface ProjectSummary {
  slug: string;
  name: string;
  description: string;
  status: ProjectRow["status"];
  isDemo: boolean;
  archived: boolean;
  updatedAt: Date;
  snapshot: ProjectSnapshot;
  nextAction: NextAction;
}

export async function listProjects(
  actor: Actor,
  options: { archived?: boolean } = {},
): Promise<ProjectSummary[]> {
  const rows = await listMemberProjects(db, actor.id, options);
  const snapshots = await loadSnapshots(db, rows);
  return rows.map((p) => {
    const snapshot = snapshots.get(p.id) as ProjectSnapshot;
    return {
      slug: p.slug,
      name: p.name,
      description: p.description,
      status: p.status,
      isDemo: p.isDemo,
      archived: p.archivedAt !== null,
      updatedAt: p.updatedAt,
      snapshot,
      nextAction: getNextProjectAction(snapshot),
    };
  });
}

const generalInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000),
});

export async function updateProjectGeneral(actor: Actor, slug: string, input: unknown) {
  const data = parse(generalInput, input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    await tx.update(projects).set(data).where(eq(projects.id, project.id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "project.updated",
      entityType: "project",
      entityId: project.id,
      metadata: { fields: "name,description" },
    });
  });
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const settingsInput = z.object({
  buildStrategy: z.enum(BUILD_STRATEGIES),
  repoProvider: z.enum(REPO_PROVIDERS).nullable(),
  repoUrl: optionalText(300).refine((v) => v === null || /^https?:\/\/\S+$/.test(v), "url"),
  defaultBranch: optionalText(100),
  deployProvider: z.enum(DEPLOY_PROVIDERS).nullable(),
  environment: optionalText(60),
  domain: optionalText(253).refine(
    (v) => v === null || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v),
    "domain",
  ),
  aiProvider: optionalText(60),
  aiModel: optionalText(100),
});

/** Preferences for future integrations; stored only, nothing connects to an outside service. */
export async function updateProjectSettings(actor: Actor, slug: string, input: unknown) {
  const { buildStrategy, ...settings } = parse(settingsInput, input);
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    await tx.update(projects).set({ buildStrategy }).where(eq(projects.id, project.id));
    await tx
      .insert(projectSettings)
      .values({ projectId: project.id, ...settings })
      .onConflictDoUpdate({ target: projectSettings.projectId, set: settings });
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "settings.updated",
      entityType: "project",
      entityId: project.id,
    });
  });
}

export async function setProjectArchived(actor: Actor, slug: string, archived: boolean) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:archive", tx);
    if (archived === (project.status === "archived")) return;

    let status: ProjectStatus = "archived";
    if (!archived) {
      // The status before archiving is kept on the archive event, so restore is exact.
      const [last] = await tx
        .select({ metadata: activities.metadata })
        .from(activities)
        .where(and(eq(activities.projectId, project.id), eq(activities.type, "project.archived")))
        .orderBy(desc(activities.createdAt))
        .limit(1);
      const previous = last?.metadata.previousStatus;
      status = isProjectStatus(previous) && previous !== "archived" ? previous : "planning";
    }
    await tx
      .update(projects)
      .set({ status, archivedAt: archived ? new Date() : null })
      .where(eq(projects.id, project.id));
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: archived ? "project.archived" : "project.restored",
      entityType: "project",
      entityId: project.id,
      metadata: archived ? { previousStatus: project.status } : { status },
    });
  });
}

const isProjectStatus = (value: unknown): value is ProjectStatus =>
  typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);

/** Permanent. The caller must type the exact project name to confirm. */
export async function deleteProject(actor: Actor, slug: string, confirmName: unknown) {
  await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:delete", tx);
    if (typeof confirmName !== "string" || confirmName.trim() !== project.name) {
      throw new AppError("VALIDATION_ERROR", "Name does not match", { confirmName: "mismatch" });
    }
    await tx.delete(projects).where(eq(projects.id, project.id));
  });
}
