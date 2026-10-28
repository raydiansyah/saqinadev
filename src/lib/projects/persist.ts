import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { recordActivity } from "@/lib/activity/service";
import type { Tx } from "@/lib/db/client";
import {
  agents,
  decisions,
  documents,
  documentVersions,
  memories,
  milestones,
  projects,
  recommendations,
  requirements,
  tasks,
} from "@/lib/db/schema";
import type { BuildStrategy } from "@/lib/domain/enums";
import type { Complexity } from "@/lib/interview/types";
import type { InterviewData } from "@/lib/interviews/model";
import { insertChatMemory } from "@/lib/memory/store";
import type { ProjectRecommendation } from "@/lib/recommendations/engine";
import type { GeneratorCopy } from "./copy/types";
import { type GeneratedProject, preferredAgent } from "./generate";
import type { ProjectRow } from "./repository";

interface PersistInput {
  project: ProjectRow;
  actorId: string;
  generated: GeneratedProject;
  recommendation: ProjectRecommendation;
  complexity: Complexity;
  platform: string | null;
  buildStrategy: BuildStrategy;
  data: InterviewData;
  gen: GeneratorCopy;
}

/** Writes the generated workspace. Runs inside the caller's transaction. */
export async function persistGeneratedProject(tx: Tx, input: PersistInput): Promise<void> {
  const { project, actorId, generated, recommendation } = input;
  const projectId = project.id;

  await tx
    .update(projects)
    .set({
      // An imported project keeps the name and description read from its repository, and a
      // name a person chose is never replaced by the plan's.
      ...(input.data.sources.projectDescription === "imported"
        ? {}
        : {
            ...(project.nameSource === "auto" ? { name: generated.name } : {}),
            description: generated.description,
          }),
      status: "planning",
      complexity: input.complexity,
      platform: input.platform,
      buildStrategy: input.buildStrategy,
      preferredAgent: preferredAgent(input.data, recommendation, input.gen),
    })
    .where(eq(projects.id, projectId));

  if (generated.requirements.length > 0) {
    await tx.insert(requirements).values(
      generated.requirements.map((r, position) => ({
        projectId,
        group: r.group,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
        source: r.source,
        confidence: r.confidence,
        position,
        updatedBy: actorId,
      })),
    );
  }

  if (recommendation.items.length > 0) {
    await tx.insert(recommendations).values(
      recommendation.items.map((i) => ({
        projectId,
        key: i.key,
        value: {
          label: i.value,
          ...(i.detail ? { detail: i.detail } : {}),
          ...(i.ids ? { ids: i.ids } : {}),
        },
        reason: i.reason,
        confidence: i.confidence,
        source: i.source,
      })),
    );
  }

  // An imported repository may already have brought its own PRD and plan: those stay.
  const have = new Set(
    (
      await tx
        .select({ slug: documents.slug })
        .from(documents)
        .where(and(eq(documents.projectId, projectId), inArray(documents.slug, ["prd", "plan"])))
    ).map((d) => d.slug),
  );
  const generatedDocs = [
    {
      projectId,
      type: "prd" as const,
      title: "PRD",
      slug: "prd",
      content: generated.prd,
      createdBy: actorId,
      updatedBy: actorId,
    },
    {
      projectId,
      type: "plan" as const,
      title: "PLAN",
      slug: "plan",
      content: generated.plan,
      createdBy: actorId,
      updatedBy: actorId,
    },
  ].filter(
    // An imported project's documents come from its repository only: nothing is written for it.
    (d) => !have.has(d.slug) && input.data.sources.projectDescription !== "imported",
  );
  if (generatedDocs.length > 0) {
    const docs = await tx
      .insert(documents)
      .values(generatedDocs)
      .returning({ id: documents.id, content: documents.content });
    await tx
      .insert(documentVersions)
      .values(
        docs.map((d) => ({ documentId: d.id, version: 1, content: d.content, createdBy: actorId })),
      );
  }

  // Tasks the repository already brought are the plan; generated ones would only duplicate them.
  const [{ existingTasks }] = await tx
    .select({ existingTasks: count() })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  // An imported project's tasks come from its repository documents or not at all, until a person
  // runs the interview or writes a PRD.
  const generatedMilestones =
    Number(existingTasks) > 0 || input.data.sources.projectDescription === "imported"
      ? []
      : generated.milestones;

  let position = 0;
  for (const [index, milestone] of generatedMilestones.entries()) {
    const [row] = await tx
      .insert(milestones)
      .values({ projectId, title: milestone.title, goal: milestone.goal, position: index })
      .returning({ id: milestones.id });
    if (milestone.tasks.length > 0) {
      await tx.insert(tasks).values(
        milestone.tasks.map((t) => ({
          projectId,
          milestoneId: row.id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          source: "plan" as const,
          phase: t.phase,
          position: position++,
        })),
      );
    }
  }

  if (generated.memories.length > 0) {
    for (const m of generated.memories) {
      await insertChatMemory(tx, { projectId, ...m, createdBy: actorId });
    }
  }
  if (generated.decisions.length > 0) {
    await tx.insert(decisions).values(
      generated.decisions.map((d, i) => ({
        projectId,
        number: i + 1,
        ...d,
        status: "accepted" as const,
        createdBy: actorId,
      })),
    );
  }
  await tx.insert(agents).values(generated.agents.map((a) => ({ projectId, ...a })));

  // One change per kind of record the project starts with, so a reader that follows the change
  // feed learns about them without scanning the project.
  const origin = "system";
  if (generated.memories.length > 0)
    await recordActivity(tx, {
      projectId,
      actorId,
      type: "memory.created",
      entityType: "memory",
      metadata: { count: generated.memories.length, origin },
    });
  if (generated.decisions.length > 0)
    await recordActivity(tx, {
      projectId,
      actorId,
      type: "decision.created",
      entityType: "decision",
      metadata: { count: generated.decisions.length, origin },
    });
  await recordActivity(tx, {
    projectId,
    actorId,
    type: "document.created",
    entityType: "document",
    metadata: { slug: "prd" },
  });
}
