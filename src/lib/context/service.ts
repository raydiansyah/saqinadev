import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  decisions,
  documents,
  memories,
  milestones,
  recommendations,
  requirements,
  tasks,
} from "@/lib/db/schema";
import type { ProjectContext } from "./types";

/**
 * The single read model future agents consume. Every integration (MCP, export, agent runs)
 * calls this instead of querying the project tables itself.
 * Requires a ProjectAccess, i.e. a caller that already passed the membership check.
 */
export async function getProjectContext(access: ProjectAccess): Promise<ProjectContext> {
  const { project } = access;
  const id = project.id;

  const [reqs, recs, docs, ms, ts, mem, dec] = await Promise.all([
    db
      .select()
      .from(requirements)
      .where(eq(requirements.projectId, id))
      .orderBy(asc(requirements.position)),
    db.select().from(recommendations).where(eq(recommendations.projectId, id)),
    db
      .select()
      .from(documents)
      .where(eq(documents.projectId, id))
      .orderBy(asc(documents.createdAt)),
    db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id))
      .orderBy(asc(milestones.position)),
    db.select().from(tasks).where(eq(tasks.projectId, id)).orderBy(asc(tasks.position)),
    db.select().from(memories).where(eq(memories.projectId, id)).orderBy(desc(memories.createdAt)),
    db.select().from(decisions).where(eq(decisions.projectId, id)).orderBy(asc(decisions.number)),
  ]);

  const doc = (slug: string) => docs.find((d) => d.slug === slug);
  const prd = doc("prd");
  const plan = doc("plan");

  return {
    project: {
      name: project.name,
      slug: project.slug,
      description: project.description,
      type: project.type,
      status: project.status,
      complexity: project.complexity,
      platform: project.platform,
      buildStrategy: project.buildStrategy,
      preferredAgent: project.preferredAgent,
      locale: project.locale,
      updatedAt: project.updatedAt,
    },
    requirements: reqs.map(({ group, title, description, priority, status, source }) => ({
      group,
      title,
      description,
      priority,
      status,
      source,
    })),
    recommendations: recs.map(({ key, value, reason, confidence, source }) => ({
      key,
      value: value.detail ? `${value.label} ${value.detail}` : value.label,
      reason,
      confidence,
      source,
    })),
    prd: prd ? { content: prd.content, version: prd.version, status: prd.status } : null,
    plan: {
      document: plan ? { content: plan.content, version: plan.version, status: plan.status } : null,
      milestones: ms.map((m) => ({
        title: m.title,
        goal: m.goal,
        tasks: ts
          .filter((t) => t.milestoneId === m.id)
          .map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
      })),
    },
    tasks: ts.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      description: t.description,
    })),
    memory: mem.map(({ title, content, category, importance, source, createdAt }) => ({
      title,
      content,
      category,
      importance,
      source,
      createdAt,
    })),
    decisions: dec.map(
      ({ number, question, context, options, selected, reason, status, createdAt }) => ({
        number,
        question,
        context,
        options,
        selected,
        reason,
        status,
        createdAt,
      }),
    ),
    documents: docs
      .filter((d) => d.type === "custom" || d.type === "notes")
      .map((d) => ({ title: d.title, slug: d.slug, content: d.content })),
  };
}
