import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { recordActivity } from "@/lib/activity/service";
import { db, type Tx } from "@/lib/db/client";
import { ciRuns, deployments, repositoryConnections, taskLinks, tasks } from "@/lib/db/schema";
import type { TaskLinkKind, TaskLinkState } from "@/lib/domain/enums";
import { enqueueCodeIndex } from "@/lib/memory/code/schedule";
import { findTaskRefs } from "../task-refs";
import type { GitEvent } from "./parse";

type Connection = typeof repositoryConnections.$inferSelect;

const OPEN_STATES = ["backlog", "todo", "in_progress", "blocked"] as const;

export interface ApplyResult {
  /** Tasks whose status the event changed. */
  moved: number;
  /** Task links the event created or updated. */
  linked: number;
}

/** The project's tasks named by these references (`T-` + first eight characters of the id). */
async function tasksForRefs(tx: Tx, projectId: string, refs: string[]) {
  if (refs.length === 0) return [];
  const prefixes = refs.map((r) => r.slice(2));
  return tx
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        sql`left(replace(${tasks.id}::text, '-', ''), 8) in (${sql.join(
          prefixes.map((p) => sql`${p}`),
          sql`, `,
        )})`,
      ),
    );
}

async function link(
  tx: Tx,
  projectId: string,
  taskId: string,
  l: {
    kind: TaskLinkKind;
    ref: string;
    url?: string | null;
    title?: string;
    state?: TaskLinkState | null;
  },
) {
  await tx
    .insert(taskLinks)
    .values({
      projectId,
      taskId,
      kind: l.kind,
      ref: l.ref,
      url: l.url ?? null,
      title: (l.title ?? "").slice(0, 300),
      state: l.state ?? null,
    })
    .onConflictDoUpdate({
      target: [taskLinks.taskId, taskLinks.kind, taskLinks.ref],
      set: {
        url: l.url ?? null,
        ...(l.title ? { title: l.title.slice(0, 300) } : {}),
        ...(l.state ? { state: l.state } : {}),
      },
    });
}

/** The repository host changed a task's state; the activity says so, with no person as actor. */
async function moveTask(
  tx: Tx,
  projectId: string,
  task: { id: string; title: string; status: string },
  to: "review" | "done",
  why: string,
): Promise<boolean> {
  const allowed = to === "review" ? (OPEN_STATES as readonly string[]) : [...OPEN_STATES, "review"];
  if (!allowed.includes(task.status)) return false;
  await tx
    .update(tasks)
    .set({ status: to, completedAt: to === "done" ? new Date() : null })
    .where(eq(tasks.id, task.id));
  await recordActivity(tx, {
    projectId,
    actorId: null,
    type: to === "done" ? "task.completed" : "task.updated",
    entityType: "task",
    entityId: task.id,
    metadata: { title: task.title, fromStatus: task.status, toStatus: to, origin: "github", why },
  });
  return true;
}

/**
 * Records one repository event against the project. A pull request opened for a task puts it in
 * review; merging it is the person's decision on GitHub and completes the task. CI runs and
 * deployments are stored as they are, and the delivery page reads them as evidence (a person
 * still confirms the build, review and deploy answers).
 */
export async function applyGitEvent(connection: Connection, event: GitEvent): Promise<ApplyResult> {
  const projectId = connection.projectId;
  const base = connection.developmentBranch ?? connection.defaultBranch;
  return db.transaction(async (tx) => {
    const result: ApplyResult = { moved: 0, linked: 0 };
    switch (event.kind) {
      case "pull_request": {
        const found = await tasksForRefs(
          tx,
          projectId,
          findTaskRefs(event.headRef, event.title, event.body),
        );
        const state: TaskLinkState =
          event.action === "closed" ? (event.merged ? "merged" : "closed") : "open";
        for (const task of found) {
          await link(tx, projectId, task.id, {
            kind: "pr",
            ref: String(event.number),
            url: event.url,
            title: event.title,
            state,
          });
          if (event.headRef)
            await link(tx, projectId, task.id, { kind: "branch", ref: event.headRef });
          result.linked += 1;
          if (
            state === "open" &&
            (await moveTask(tx, projectId, task, "review", `PR #${event.number} opened`))
          )
            result.moved += 1;
          if (
            state === "merged" &&
            (await moveTask(tx, projectId, task, "done", `PR #${event.number} merged`))
          )
            result.moved += 1;
        }
        return result;
      }
      case "push": {
        const named = findTaskRefs(event.branch, ...event.commits.map((c) => c.message));
        const found = await tasksForRefs(tx, projectId, named);
        for (const task of found) {
          const ref = `T-${task.id.replace(/-/g, "").slice(0, 8)}`;
          if (findTaskRefs(event.branch).includes(ref))
            await link(tx, projectId, task.id, { kind: "branch", ref: event.branch });
          for (const c of event.commits.filter((c) => findTaskRefs(c.message).includes(ref))) {
            await link(tx, projectId, task.id, {
              kind: "commit",
              ref: c.sha.slice(0, 12),
              url: c.url,
              title: c.message.split("\n")[0],
            });
            result.linked += 1;
          }
        }
        if (event.branch === base && event.after) {
          await tx
            .update(repositoryConnections)
            .set({ headSha: event.after, lastSyncedAt: new Date() })
            .where(eq(repositoryConnections.id, connection.id));
          // The code graph follows the branch: a job, never inline.
          await enqueueCodeIndex(tx, { projectId, key: `push:${event.after}` }).catch(() => false);
        }
        return result;
      }
      case "ci": {
        await tx
          .insert(ciRuns)
          .values({
            projectId,
            externalId: event.externalId,
            sha: event.sha,
            branch: event.branch,
            name: event.name,
            status: event.status,
            conclusion: event.conclusion,
            url: event.url,
          })
          .onConflictDoUpdate({
            target: [ciRuns.projectId, ciRuns.externalId],
            set: { status: event.status, conclusion: event.conclusion, url: event.url },
          });
        return result;
      }
      case "deployment": {
        await tx
          .insert(deployments)
          .values({
            projectId,
            provider: "github",
            externalId: event.externalId,
            environment: event.environment,
            state: event.state,
            url: event.url,
            sha: event.sha,
          })
          .onConflictDoUpdate({
            target: [deployments.projectId, deployments.provider, deployments.externalId],
            set: { state: event.state, url: event.url },
          });
        return result;
      }
    }
  });
}

/** Task links of the project, newest first, for the Git tab. */
export async function listTaskLinks(projectId: string, taskIds?: string[]) {
  return db
    .select()
    .from(taskLinks)
    .where(
      taskIds?.length
        ? and(eq(taskLinks.projectId, projectId), inArray(taskLinks.taskId, taskIds))
        : eq(taskLinks.projectId, projectId),
    )
    .orderBy(sql`${taskLinks.updatedAt} desc`)
    .limit(100);
}
