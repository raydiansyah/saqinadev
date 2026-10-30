import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  ciRuns,
  deployments,
  deployTargets,
  executionArtifacts,
  executions,
  repositoryConnections,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { DeliveryDTO, StageState } from "./dto";

type Stage = DeliveryDTO["stages"][number];
const stage = (key: Stage["key"], state: StageState, detail: string | null = null): Stage => ({
  key,
  state,
  detail,
});

/**
 * Where the work stands between code and a published site, from what the repository, CI and
 * Vercel reported. A stage with no report says "unknown": we do not guess that a build passed or a
 * preview exists. Source code finished, build passed, preview ready, deploy ready and published are
 * five different facts, and only a person's Publish makes the last one true.
 */
export async function getExecutionDelivery(
  actor: Actor,
  slug: string,
  executionId: string,
): Promise<DeliveryDTO> {
  if (!z.uuid().safeParse(executionId).success) throw new AppError("NOT_FOUND");
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  const projectId = access.project.id;
  const [execution] = await db
    .select()
    .from(executions)
    .where(and(eq(executions.id, executionId), eq(executions.projectId, projectId)));
  if (!execution) throw new AppError("NOT_FOUND");

  const [commits, [repo], [target]] = await Promise.all([
    db
      .select({ sha: executionArtifacts.commitSha, at: executionArtifacts.createdAt })
      .from(executionArtifacts)
      .where(
        and(
          eq(executionArtifacts.executionId, execution.id),
          eq(executionArtifacts.kind, "commit"),
        ),
      )
      .orderBy(desc(executionArtifacts.createdAt)),
    db.select().from(repositoryConnections).where(eq(repositoryConnections.projectId, projectId)),
    db.select().from(deployTargets).where(eq(deployTargets.projectId, projectId)),
  ]);
  const shas = commits.flatMap((c) => (c.sha ? [c.sha] : []));
  const branch = execution.branch;

  const runs = branch
    ? await db
        .select()
        .from(ciRuns)
        .where(and(eq(ciRuns.projectId, projectId), eq(ciRuns.branch, branch)))
        .orderBy(desc(ciRuns.updatedAt))
        .limit(10)
    : [];
  // A preview is the one made from the work branch, or from one of the commits the agents made.
  const previews = branch
    ? await db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            eq(deployments.environment, "preview"),
            shas.length > 0
              ? or(eq(deployments.ref, branch), inArray(deployments.sha, shas))
              : eq(deployments.ref, branch),
          ),
        )
        .orderBy(desc(deployments.updatedAt))
        .limit(5)
    : [];
  const production = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.projectId, projectId), eq(deployments.environment, "production")))
    .orderBy(desc(deployments.updatedAt))
    .limit(1);

  const lastCommit = commits[0]?.sha
    ? { sha: commits[0].sha, at: commits[0].at.toISOString() }
    : null;
  const ciStatus: DeliveryDTO["ci"]["status"] =
    runs.length === 0
      ? "none"
      : runs.some((r) => r.status !== "completed")
        ? "running"
        : runs.every(
              (r) =>
                r.conclusion === "success" ||
                r.conclusion === "skipped" ||
                r.conclusion === "neutral",
            )
          ? "passed"
          : "failed";
  const newest = previews[0] ?? null;
  const previewStatus: DeliveryDTO["preview"]["status"] = !lastCommit
    ? "no_commits"
    : !newest
      ? "none_yet"
      : newest.state === "success"
        ? "ready"
        : newest.state === "failure"
          ? "failed"
          : "pending";

  const open = ["queued", "planning", "running", "waiting_approval", "cancelling"].includes(
    execution.status,
  );
  const stages: Stage[] = [
    !lastCommit
      ? stage("source", open ? "pending" : "unknown", "no_commits")
      : stage(
          "source",
          open ? "pending" : execution.status === "succeeded" ? "done" : "blocked",
          open ? "building" : execution.status,
        ),
    ciStatus === "passed"
      ? stage("build", "done")
      : ciStatus === "running"
        ? stage("build", "pending")
        : ciStatus === "failed"
          ? stage("build", "blocked", "ci_failed")
          : stage("build", "unknown", "no_ci"),
    previewStatus === "ready"
      ? stage("preview", "done")
      : previewStatus === "pending"
        ? stage("preview", "pending")
        : previewStatus === "failed"
          ? stage("preview", "blocked", "preview_failed")
          : stage("preview", "unknown", previewStatus),
    !repo || repo.status === "disconnected"
      ? stage("deploy", "blocked", "no_repository")
      : target?.status === "ready"
        ? stage("deploy", "done")
        : target?.status === "error"
          ? stage("deploy", "blocked", "target_error")
          : stage("deploy", "unknown", "not_set_up"),
    // Only a person's Publish makes this true, and only a production deployment after these commits shows it.
    production[0]?.state === "success" &&
    lastCommit &&
    production[0].updatedAt > new Date(lastCommit.at)
      ? stage("published", "done")
      : stage("published", "unknown", "not_published"),
  ];

  return {
    repository: repo ? { provider: repo.provider, fullName: repo.fullName } : null,
    branch,
    ci: {
      status: ciStatus,
      runs: runs.map((r) => ({
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        url: r.url,
        updatedAt: r.updatedAt.toISOString(),
      })),
    },
    preview: {
      status: previewStatus,
      url: newest?.state === "success" ? newest.url : null,
      updatedAt: newest ? newest.updatedAt.toISOString() : null,
    },
    lastCommit,
    stages,
  };
}
