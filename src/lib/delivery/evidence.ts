import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { ciRuns, deployments, repositoryConnections, taskLinks } from "@/lib/db/schema";
import type { DeliveryStep } from "@/lib/domain/delivery";

export interface DeliveryEvidence {
  step: DeliveryStep;
  /** What was seen, as a code the page translates. */
  code: "ci_green" | "pr_merged" | "deployed";
  detail: string;
}

/**
 * What the repository and Vercel have shown, as suggestions for the three delivery answers: a green
 * CI run on the default branch, a merged pull request, a successful production deployment. Only
 * suggestions: a person still answers, so nothing is filled in behind their back (ADR 0008).
 */
export async function deliveryEvidence(access: ProjectAccess): Promise<DeliveryEvidence[]> {
  const projectId = access.project.id;
  const out: DeliveryEvidence[] = [];
  const [repo] = await db
    .select({
      branch: repositoryConnections.defaultBranch,
      dev: repositoryConnections.developmentBranch,
    })
    .from(repositoryConnections)
    .where(eq(repositoryConnections.projectId, projectId));
  const branch = repo?.dev ?? repo?.branch ?? null;

  if (branch) {
    const [run] = await db
      .select()
      .from(ciRuns)
      .where(
        and(
          eq(ciRuns.projectId, projectId),
          eq(ciRuns.branch, branch),
          eq(ciRuns.status, "completed"),
        ),
      )
      .orderBy(desc(ciRuns.updatedAt))
      .limit(1);
    if (run?.conclusion === "success")
      out.push({ step: "build", code: "ci_green", detail: `${run.name} · ${run.sha.slice(0, 8)}` });
  }
  const [merged] = await db
    .select()
    .from(taskLinks)
    .where(
      and(
        eq(taskLinks.projectId, projectId),
        eq(taskLinks.kind, "pr"),
        eq(taskLinks.state, "merged"),
      ),
    )
    .orderBy(desc(taskLinks.updatedAt))
    .limit(1);
  if (merged)
    out.push({
      step: "review",
      code: "pr_merged",
      detail: `#${merged.ref} ${merged.title}`.trim(),
    });

  const [live] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.projectId, projectId), eq(deployments.environment, "production")))
    .orderBy(desc(deployments.updatedAt))
    .limit(1);
  if (live?.state === "success")
    out.push({ step: "deploy", code: "deployed", detail: live.url ?? "" });
  return out;
}
