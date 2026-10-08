import "server-only";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import {
  documents,
  interviews,
  projectMembers,
  projectSettings,
  projects,
  requirements,
  tasks,
} from "@/lib/db/schema";
import type { TaskStatus } from "@/lib/domain/enums";
import { EMPTY_TASK_COUNTS, type ProjectSnapshot } from "./progress";

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectSettingsRow = typeof projectSettings.$inferSelect;

/** Projects the user is a member of, most recently changed first. */
export async function listMemberProjects(
  executor: Executor,
  userId: string,
  options: { archived?: boolean } = {},
): Promise<ProjectRow[]> {
  return executor
    .select({ project: projects })
    .from(projects)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
    )
    .where(options.archived ? undefined : isNull(projects.archivedAt))
    .orderBy(desc(projects.updatedAt))
    .then((rows) => rows.map((r) => r.project));
}

/** Snapshots for many projects in four grouped queries instead of four per project. */
export async function loadSnapshots(
  executor: Executor,
  list: Pick<ProjectRow, "id" | "slug" | "status">[],
): Promise<Map<string, ProjectSnapshot>> {
  const ids = list.map((p) => p.id);
  const result = new Map<string, ProjectSnapshot>();
  if (ids.length === 0) return result;

  const [interviewRows, reqRows, prdRows, taskRows] = await Promise.all([
    executor
      .selectDistinctOn([interviews.projectId], {
        projectId: interviews.projectId,
        status: interviews.status,
      })
      .from(interviews)
      .where(inArray(interviews.projectId, ids))
      .orderBy(interviews.projectId, desc(interviews.startedAt)),
    executor
      .select({ projectId: requirements.projectId, status: requirements.status, n: count() })
      .from(requirements)
      .where(
        and(
          inArray(requirements.projectId, ids),
          inArray(requirements.status, ["unknown", "conflicting"]),
        ),
      )
      .groupBy(requirements.projectId, requirements.status),
    executor
      .select({ projectId: documents.projectId, status: documents.status })
      .from(documents)
      .where(and(inArray(documents.projectId, ids), eq(documents.type, "prd"))),
    executor
      .select({ projectId: tasks.projectId, status: tasks.status, n: count() })
      .from(tasks)
      .where(inArray(tasks.projectId, ids))
      .groupBy(tasks.projectId, tasks.status),
  ]);

  for (const p of list) {
    result.set(p.id, {
      slug: p.slug,
      status: p.status,
      interviewStatus: null,
      unknownRequirements: 0,
      conflictingRequirements: 0,
      prdStatus: null,
      tasks: { ...EMPTY_TASK_COUNTS },
    });
  }
  for (const r of interviewRows) {
    const s = result.get(r.projectId);
    if (s) s.interviewStatus = r.status;
  }
  for (const r of reqRows) {
    const s = result.get(r.projectId);
    if (!s) continue;
    if (r.status === "unknown") s.unknownRequirements = r.n;
    else s.conflictingRequirements = r.n;
  }
  for (const r of prdRows) {
    const s = result.get(r.projectId);
    if (s) s.prdStatus = r.status;
  }
  for (const r of taskRows) {
    const s = result.get(r.projectId);
    if (s) s.tasks[r.status as TaskStatus] = r.n;
  }
  return result;
}

export async function loadSnapshot(
  executor: Executor,
  project: ProjectRow,
): Promise<ProjectSnapshot> {
  const map = await loadSnapshots(executor, [project]);
  return map.get(project.id) as ProjectSnapshot;
}

export async function slugExists(executor: Executor, slug: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return !!row;
}

export async function getSettings(
  executor: Executor,
  projectId: string,
): Promise<ProjectSettingsRow | undefined> {
  const [row] = await executor
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, projectId));
  return row;
}

/** Counts used by the overview's context map. */
export async function contextCounts(executor: Executor, projectId: string) {
  const [row] = await executor
    .execute<{
      requirements: number;
      tasks: number;
      memories: number;
      decisions: number;
      documents: number;
      milestones: number;
    }>(sql`
    select
      (select count(*)::int from requirements where project_id = ${projectId}) as requirements,
      (select count(*)::int from tasks where project_id = ${projectId}) as tasks,
      (select count(*)::int from memories where project_id = ${projectId}) as memories,
      (select count(*)::int from decisions where project_id = ${projectId}) as decisions,
      (select count(*)::int from documents where project_id = ${projectId}) as documents,
      (select count(*)::int from milestones where project_id = ${projectId}) as milestones
  `)
    .then((r) => r.rows);
  return row;
}
