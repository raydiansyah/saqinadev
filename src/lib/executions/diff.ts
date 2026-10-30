import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { executions } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getRepository, withRepo } from "@/lib/git/service";
import { GitError } from "@/lib/git/types";
import { allow } from "@/lib/rate-limit";
import { scrubSecrets } from "@/lib/secrets/scan";
import type { ExecutionDiffDTO } from "./dto";

const NONE: Omit<ExecutionDiffDTO, "status"> = {
  aheadBy: 0,
  files: [],
  commits: [],
  truncated: false,
};

/**
 * What the work branch changed, asked of the repository host itself. If the branch does not exist
 * yet, or the host cannot say, the answer says so: it never falls back to a list we made up.
 * Patches are scrubbed of anything that looks like a secret before they leave the server.
 */
export async function getExecutionDiff(
  actor: Actor,
  slug: string,
  executionId: string,
): Promise<ExecutionDiffDTO> {
  if (!z.uuid().safeParse(executionId).success) throw new AppError("NOT_FOUND");
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  const [execution] = await db
    .select({ id: executions.id, branch: executions.branch })
    .from(executions)
    .where(and(eq(executions.id, executionId), eq(executions.projectId, access.project.id)));
  if (!execution) throw new AppError("NOT_FOUND");
  if (!(await allow(`execution:diff:${access.project.id}`, 60, 60_000)))
    throw new AppError("RATE_LIMIT");
  if (!execution.branch) return { status: "no_branch", ...NONE };

  const repo = await getRepository(access);
  if (!repo || repo.status === "disconnected") return { status: "no_repository", ...NONE };
  const base = repo.developmentBranch ?? repo.defaultBranch;
  try {
    const result = await withRepo(repo, async (adapter, ref, token) => {
      if (!adapter.compare) throw new GitError("unsupported");
      return adapter.compare(ref, token, { base, head: execution.branch as string });
    });
    return {
      status: "ok",
      base,
      head: execution.branch,
      aheadBy: result.aheadBy,
      files: result.files.map((f) => ({
        ...f,
        patch: f.patch === null ? null : scrubSecrets(f.patch),
      })),
      commits: result.commits,
      truncated: result.truncated,
    };
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    // The branch is made by the first commit: before that, the host does not know it.
    if (error.code === "not_found")
      return { status: "no_branch", base, head: execution.branch, ...NONE };
    if (error.code === "unsupported")
      return { status: "unsupported", base, head: execution.branch, ...NONE };
    return { status: "error", code: error.code, base, head: execution.branch, ...NONE };
  }
}
