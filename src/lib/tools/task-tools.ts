import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { recordActivity } from "@/lib/activity/service";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { repositoryConnections, taskLinks, tasks } from "@/lib/db/schema";
import { TASK_STATUSES } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { branchFor, taskRef } from "@/lib/git/task-refs";

/** The tasks an IDE agent works with over MCP: read, claim, report. Never "done": a person does that. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^T-([0-9a-f]{8})$/i;

async function find(access: ProjectAccess, ref: string) {
  const projectId = access.project.id;
  const where = UUID.test(ref)
    ? and(eq(tasks.projectId, projectId), eq(tasks.id, ref))
    : REF.test(ref)
      ? and(
          eq(tasks.projectId, projectId),
          sql`left(replace(${tasks.id}::text, '-', ''), 8) = ${ref.slice(2).toLowerCase()}`,
        )
      : null;
  if (!where) throw new AppError("NOT_FOUND");
  const [row] = await db.select().from(tasks).where(where);
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

export async function listTasksTool(access: ProjectAccess, status?: string) {
  const valid = TASK_STATUSES.find((s) => s === status);
  const rows = await db
    .select()
    .from(tasks)
    .where(
      valid
        ? and(eq(tasks.projectId, access.project.id), eq(tasks.status, valid))
        : eq(tasks.projectId, access.project.id),
    )
    .orderBy(tasks.position)
    .limit(100);
  return {
    tasks: rows.map((t) => ({
      ref: taskRef(t.id),
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    })),
  };
}

export async function readTaskTool(access: ProjectAccess, ref: string) {
  const t = await find(access, ref);
  const links = await db
    .select()
    .from(taskLinks)
    .where(eq(taskLinks.taskId, t.id))
    .orderBy(taskLinks.createdAt)
    .limit(30);
  return {
    ref: taskRef(t.id),
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    links: links.map((l) => ({ kind: l.kind, ref: l.ref, url: l.url, state: l.state })),
  };
}

async function branchPrefix(projectId: string) {
  const [repo] = await db
    .select({ prefix: repositoryConnections.agentBranchPrefix })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  return repo?.prefix ?? "saqina/";
}

const via = (agentName: string | null) => ({ origin: "mcp", agent: agentName ?? "agent" });

/** Starts work on a task. Refuses one already in progress, in review or done. */
export async function claimTaskTool(access: ProjectAccess, ref: string, agentName: string | null) {
  const t = await find(access, ref);
  const branch = branchFor(await branchPrefix(access.project.id), t.id, t.title);
  if (!["backlog", "todo", "blocked"].includes(t.status))
    return { claimed: false, status: t.status, ref: taskRef(t.id), branch };
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ status: "in_progress", completedAt: null })
      .where(eq(tasks.id, t.id));
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: access.actor.id,
      type: "task.updated",
      entityType: "task",
      entityId: t.id,
      metadata: {
        title: t.title,
        fromStatus: t.status,
        toStatus: "in_progress",
        ...via(agentName),
      },
    });
  });
  return { claimed: true, status: "in_progress", ref: taskRef(t.id), branch };
}

export interface TaskReport {
  status: "review" | "blocked";
  summary: string;
  branch?: string;
  pullRequestUrl?: string;
  issues?: string[];
}

/** An agent says where the task stands. `done` is not an option: merging or approving is a person's. */
export async function reportTaskResultTool(
  access: ProjectAccess,
  ref: string,
  report: TaskReport,
  agentName: string | null,
) {
  if (report.status !== "review" && report.status !== "blocked")
    throw new AppError("VALIDATION_ERROR", "Status", { status: "invalid" });
  const t = await find(access, ref);
  if (t.status === "done") throw new AppError("CONFLICT", "Task is done", { task: "done" });
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ status: report.status, completedAt: null })
      .where(eq(tasks.id, t.id));
    if (report.branch)
      await tx
        .insert(taskLinks)
        .values({
          projectId: access.project.id,
          taskId: t.id,
          kind: "branch",
          ref: report.branch.slice(0, 200),
        })
        .onConflictDoNothing();
    const pr = /^https:\/\/[^\s]+\/pull\/(\d+)\/?$/.exec(report.pullRequestUrl ?? "");
    if (pr && report.pullRequestUrl)
      await tx
        .insert(taskLinks)
        .values({
          projectId: access.project.id,
          taskId: t.id,
          kind: "pr",
          ref: pr[1],
          url: report.pullRequestUrl,
          title: t.title,
          state: "open",
        })
        .onConflictDoNothing();
    await recordActivity(tx, {
      projectId: access.project.id,
      actorId: access.actor.id,
      type: "task.updated",
      entityType: "task",
      entityId: t.id,
      metadata: {
        title: t.title,
        fromStatus: t.status,
        toStatus: report.status,
        summary: report.summary.slice(0, 500),
        ...(report.issues?.length ? { issues: report.issues.join(" | ").slice(0, 500) } : {}),
        ...via(agentName),
      },
    });
  });
  return { ref: taskRef(t.id), status: report.status };
}
