import "server-only";
import { desc, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { ciRuns, repositoryConnections, taskLinks, tasks } from "@/lib/db/schema";

export interface GitState {
  repository: {
    fullName: string;
    defaultBranch: string;
    headSha: string | null;
    eventsOn: boolean;
  } | null;
  links: {
    id: string;
    kind: "branch" | "pr" | "commit";
    ref: string;
    url: string | null;
    title: string;
    state: "open" | "merged" | "closed" | null;
    taskId: string;
    taskTitle: string;
  }[];
  ci: {
    id: string;
    name: string;
    sha: string;
    branch: string | null;
    status: "queued" | "in_progress" | "completed";
    conclusion: string | null;
    url: string | null;
    updatedAt: Date;
  }[];
}

/** What the repository told Saqina: which tasks have branches and pull requests, and how CI is doing. */
export async function getGitState(access: ProjectAccess): Promise<GitState> {
  const projectId = access.project.id;
  const [repo] = await db
    .select()
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  const connected = repo && repo.status !== "disconnected" ? repo : null;
  const links = await db
    .select({
      id: taskLinks.id,
      kind: taskLinks.kind,
      ref: taskLinks.ref,
      url: taskLinks.url,
      title: taskLinks.title,
      state: taskLinks.state,
      taskId: taskLinks.taskId,
      taskTitle: tasks.title,
    })
    .from(taskLinks)
    .innerJoin(tasks, eq(tasks.id, taskLinks.taskId))
    .where(eq(taskLinks.projectId, projectId))
    .orderBy(desc(taskLinks.updatedAt))
    .limit(40);
  const ci = await db
    .select()
    .from(ciRuns)
    .where(eq(ciRuns.projectId, projectId))
    .orderBy(desc(ciRuns.updatedAt))
    .limit(15);
  return {
    repository: connected
      ? {
          fullName: connected.fullName,
          defaultBranch: connected.defaultBranch,
          headSha: connected.headSha,
          eventsOn: Boolean(connected.webhookCredentialId),
        }
      : null,
    links,
    ci: ci.map((c) => ({
      id: c.id,
      name: c.name,
      sha: c.sha.slice(0, 8),
      branch: c.branch,
      status: c.status,
      conclusion: c.conclusion,
      url: c.url,
      updatedAt: c.updatedAt,
    })),
  };
}
