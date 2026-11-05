import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db, type Executor } from "@/lib/db/client";
import { executions, projects, users } from "@/lib/db/schema";
import { buildErrorsFor } from "@/lib/deploy/service";
import { AppError } from "@/lib/errors";
import { scrubSecrets } from "@/lib/secrets/scan";
import { appendEvent } from "./events";
import { enqueueJob, type JobRow } from "./jobs";
import { scheduleDrain } from "./schedule";
import { startExecution } from "./service";
import { scopeOf } from "./types";

/**
 * When the build or a check of a finished execution's work branch fails, the same agents get one
 * more go at it: a follow-up execution on the same branch, told what failed. It is bounded (two
 * rounds per original execution, one at a time) and only runs for work that had finished, so a
 * failure while agents are still working is left for their own review.
 */
export const MAX_REPAIRS = 2;
const OPEN = [
  "queued",
  "planning",
  "planned",
  "running",
  "waiting_approval",
  "cancelling",
] as const;

export interface FailedCheck {
  source: "build" | "ci";
  /** The deployment id or CI run id that failed; the same failure is handled once. */
  key: string;
  name: string;
  url: string | null;
}

/**
 * A build or check on `branch` failed. If it is a finished execution's work branch, queue a repair.
 * Cheap and idempotent, so the webhook that reports it can call it for every failure.
 */
export async function requestRepair(
  tx: Executor,
  input: { projectId: string; branch: string | null; failed: FailedCheck },
): Promise<void> {
  if (!input.branch) return;
  const [execution] = await tx
    .select({ id: executions.id, status: executions.status })
    .from(executions)
    .where(and(eq(executions.projectId, input.projectId), eq(executions.branch, input.branch)))
    .orderBy(desc(executions.createdAt))
    .limit(1);
  if (!execution || execution.status !== "succeeded") return;
  await enqueueJob(tx, {
    projectId: input.projectId,
    executionId: execution.id,
    kind: "repair",
    // The name rides after a bar so the job can say what failed; the part before it is what makes it once.
    key: `repair:${execution.id}:${input.failed.source}:${input.failed.key}|${input.failed.name.slice(0, 60)}`,
  });
}

/** What the agents are told: the failure, with a few log lines when there are any, and no secrets. */
export function repairRequest(branch: string, failed: FailedCheck, lines: string[]): string {
  const head = `Fix the failed ${failed.source === "build" ? "preview build" : "check"} "${failed.name.slice(0, 80)}" on branch ${branch}.`;
  const body = lines.length
    ? `\nThe build log says:\n${scrubSecrets(lines.join("\n")).slice(0, 2800)}`
    : "\nNo log is available: read the code on the branch and fix what would stop it from building.";
  const url = failed.url ? `\nDetails: ${failed.url}` : "";
  return `${head}${url}${body}\nChange only what is needed to make it pass. Do not add features.`.slice(
    0,
    3900,
  );
}

/**
 * Runs one repair job. Anything that is not clearly allowed ends quietly or with a visible
 * "skipped" event on the original execution, never with a thrown error that would retry forever.
 */
export async function runRepairJob(job: JobRow): Promise<void> {
  const [execution] = await db.select().from(executions).where(eq(executions.id, job.executionId));
  if (!execution || execution.status !== "succeeded" || !execution.branch) return;
  const skip = (reason: string) =>
    appendEvent(db, scopeOf(execution), "repair.skipped", { reason });

  const rootId = execution.parentExecutionId ?? execution.id;
  const [{ done }] = await db
    .select({ done: count() })
    .from(executions)
    .where(eq(executions.parentExecutionId, rootId));
  if (done >= MAX_REPAIRS) return void (await skip("budget"));
  const [{ open }] = await db
    .select({ open: count() })
    .from(executions)
    .where(and(eq(executions.parentExecutionId, rootId), inArray(executions.status, [...OPEN])));
  if (open > 0) return void (await skip("running"));

  const [who] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, execution.createdBy ?? ""));
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, execution.projectId));
  if (!who || !project) return void (await skip("no_owner"));
  const actor: Actor = { id: who.id, name: who.name, email: who.email, image: who.image ?? null };

  const failed = parseKey(job.idempotencyKey);
  const lines =
    failed.source === "build" ? await buildErrorsFor(execution.projectId, failed.key) : [];
  try {
    const next = await startExecution(
      actor,
      project.slug,
      {
        mode: "build",
        request: repairRequest(execution.branch, failed, lines),
        conversationId: execution.conversationId,
      },
      { parentExecutionId: rootId, branch: execution.branch },
    );
    await appendEvent(db, scopeOf(execution), "repair.started", {
      repairId: next.id,
      source: failed.source,
      name: failed.name,
    });
    scheduleDrain();
  } catch (error) {
    if (error instanceof AppError) return void (await skip(error.code.toLowerCase()));
    throw error;
  }
}

/** The failed check travels in the job key: `repair:<execution>:<source>:<key>|<name>`. */
function parseKey(key: string): FailedCheck {
  const [id, name = ""] = key.split("|");
  const [, , source, ...rest] = id.split(":");
  return {
    source: source === "ci" ? "ci" : "build",
    key: rest.join(":"),
    name: name || (source === "ci" ? "CI" : "Preview build"),
    url: null,
  };
}
