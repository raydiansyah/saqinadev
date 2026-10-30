import "server-only";
import { createHash } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { executions, toolExecutions } from "@/lib/db/schema";
import type { AgentPermission } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { getRepository } from "@/lib/git/service";
import { executeTool, type ToolActor } from "@/lib/tools/executor";
import type { TaskInput } from "./task-executor";

/**
 * Repository work for an agent, through the audited tool pipeline: the agent's own permissions,
 * its frozen tool list and the execution's work branch are checked on every call, and each call
 * leaves a row in the tool audit.
 */

/** A git failure is worth another try when it may pass by itself. */
const TRANSIENT = new Set(["conflict", "rate_limited", "network", "provider_error", "internal"]);

export class RepoError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

const actorOf = (input: TaskInput): ToolActor => ({
  kind: "agent",
  agentId: input.agent.id,
  name: input.agent.name,
  permissions: input.definition.permissions as AgentPermission[],
});

async function call(
  input: TaskInput,
  branch: string | null,
  tool: string,
  args: Record<string, unknown>,
  key: string,
): Promise<Record<string, unknown>> {
  try {
    const result = await executeTool({
      access: input.access,
      tool,
      input: args,
      actor: actorOf(input),
      idempotencyKey: key,
      runId: input.runId,
      execution: { branch, tools: input.definition.tools },
    });
    if (result.status !== "succeeded") throw new RepoError("approval_required", false);
    return result.output;
  } catch (error) {
    if (error instanceof RepoError) throw error;
    if (error instanceof AppError) {
      const detail = error.fields ? Object.values(error.fields)[0] : error.code;
      throw new RepoError(
        `git_${detail}`,
        TRANSIENT.has(String(detail)) || error.code === "RATE_LIMIT",
      );
    }
    throw error;
  }
}

/** Whether the project has a repository the agents can work in. */
export async function repositoryReady(input: TaskInput): Promise<string | null> {
  const repo = await getRepository(input.access);
  return repo && repo.status === "connected" ? repo.agentBranchPrefix : null;
}

/**
 * Makes sure the execution's work branch exists and returns its name. The name uses the
 * project's agent branch prefix; if that differs from the planned name the execution is updated,
 * so every task (and the Studio) names the same branch.
 */
export async function ensureWorkBranch(input: TaskInput, prefix: string): Promise<string> {
  const planned = input.execution.branch ?? "";
  const name = planned.startsWith(prefix)
    ? planned
    : `${prefix}exec-${input.execution.id.slice(0, 8)}`;
  const out = await call(
    input,
    name,
    "create_branch",
    { name },
    `exec:${input.execution.id}:branch:${input.runId}`,
  );
  const made = String(out.name ?? name);
  if (made !== planned)
    await db.update(executions).set({ branch: made }).where(eq(executions.id, input.execution.id));
  return made;
}

export async function listFiles(input: TaskInput, branch: string, path: string) {
  const out = await call(
    input,
    branch,
    "list_files",
    { path, ref: branch },
    `exec:${input.runId}:ls:${path}`,
  );
  return (out.files as Array<{ path: string; type: "file" | "dir" }>) ?? [];
}

/** The text of a file on the work branch, or null when it is not there (yet). */
export async function readFile(
  input: TaskInput,
  branch: string,
  path: string,
): Promise<string | null> {
  try {
    const out = await call(
      input,
      branch,
      "read_file",
      { path, ref: branch },
      `exec:${input.runId}:read:${path}`,
    );
    return String(out.content ?? "");
  } catch (error) {
    if (
      error instanceof RepoError &&
      /not_found|invalid_input|git_/.test(error.code) &&
      !error.retryable
    )
      return null;
    throw error;
  }
}

/**
 * Commits the files to the work branch. The same content for the same task is committed once:
 * if that exact commit already succeeded (a lost answer, a worker that died after the host
 * accepted it) the first commit id is returned instead of making a second. A failed try does
 * not block the next one: each attempt has its own key. Success means the host returned a commit id.
 */
export async function commitFiles(
  input: TaskInput,
  branch: string,
  files: Array<{ path: string; content: string }>,
  message: string,
): Promise<string> {
  const digest = createHash("sha256")
    .update(JSON.stringify([branch, message, files]))
    .digest("hex")
    .slice(0, 24);
  const base = `exec:${input.task.id}:commit:${digest}`;
  const [done] = await db
    .select({ output: toolExecutions.output })
    .from(toolExecutions)
    .where(
      and(
        eq(toolExecutions.projectId, input.execution.projectId),
        eq(toolExecutions.toolName, "commit_changes"),
        eq(toolExecutions.status, "succeeded"),
        like(toolExecutions.idempotencyKey, `${base}%`),
      ),
    )
    .limit(1);
  const earlier = (done?.output as { sha?: unknown } | null)?.sha;
  if (typeof earlier === "string" && earlier.length > 0) return earlier;
  const out = await call(
    input,
    branch,
    "commit_changes",
    { branch, message, files },
    `${base}:${input.attempt}`,
  );
  if (typeof out.sha !== "string" || out.sha.length === 0)
    throw new RepoError("git_no_commit", true);
  return out.sha;
}
