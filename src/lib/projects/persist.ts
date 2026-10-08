import "server-only";
import { eq } from "drizzle-orm";
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
      name: generated.name,
      description: generated.description,
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

  const docs = await tx
    .insert(documents)
    .values([
      {
        projectId,
        type: "prd",
        title: "PRD",
        slug: "prd",
        content: generated.prd,
        createdBy: actorId,
        updatedBy: actorId,
      },
      {
        projectId,
        type: "plan",
        title: "PLAN",
        slug: "plan",
        content: generated.plan,
        createdBy: actorId,
        updatedBy: actorId,
      },
    ])
    .returning({ id: documents.id, content: documents.content });
  await tx
    .insert(documentVersions)
    .values(
      docs.map((d) => ({ documentId: d.id, version: 1, content: d.content, createdBy: actorId })),
    );

  let position = 0;
  for (const [index, milestone] of generated.milestones.entries()) {
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
    await tx
      .insert(memories)
      .values(generated.memories.map((m) => ({ projectId, ...m, createdBy: actorId })));
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

  await recordActivity(tx, {
    projectId,
    actorId,
    type: "document.created",
    entityType: "document",
    metadata: { slug: "prd" },
  });
}
