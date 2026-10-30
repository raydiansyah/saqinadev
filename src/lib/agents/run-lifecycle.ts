import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Locale } from "@/i18n/locales";
import { getAssistantCopy } from "@/lib/assistant/copy";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Tx } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { agentRunEvents, agents, documents, requirements, tasks } from "@/lib/db/schema";
import { EventBatch } from "@/lib/events/emitter";
import { log } from "@/lib/log";
import { createProposalTx } from "@/lib/proposals/repository";
import { executeAgent } from "./execute-agent";
import type { AgentExecutionResult } from "./executor";
import { lockRun, meta, recordRunEvent, transition } from "./run-core";

/** Words longer than three letters, for matching requirements to a task. */
const keywords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9À-ɏ]+/)
    .filter((w) => w.length > 3);

/**
 * Runs a queued run to its next resting state. Safe to call twice: only a queued run starts,
 * and a run cancelled while executing keeps its cancelled state (the result is discarded).
 */
export async function startRun(access: ProjectAccess, runId: string): Promise<void> {
  const batch = new EventBatch();
  const started = await db.transaction(async (tx) => {
    const { run, agent, taskTitle } = await lockRun(tx, access, runId);
    if (run.status !== "queued") return null;
    const next = await transition(tx, run, "running");
    await tx.update(agents).set({ lastUsedAt: new Date() }).where(eq(agents.id, agent.id));
    await recordRunEvent(tx, next, "AGENT_STARTED", meta(agent, taskTitle), access.actor.id, batch);
    return { run: next, agent };
  });
  batch.flush();
  if (!started) return;
  const { run, agent } = started;
  const locale = access.project.locale as Locale;

  const [task] = run.taskId ? await db.select().from(tasks).where(eq(tasks.id, run.taskId)) : [];
  const [prd] = await db
    .select({ content: documents.content })
    .from(documents)
    .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, "prd")));
  const words = new Set(keywords(`${task?.title ?? ""} ${task?.description ?? ""}`));
  const related = (
    await db
      .select({ title: requirements.title, description: requirements.description })
      .from(requirements)
      .where(eq(requirements.projectId, access.project.id))
      .orderBy(asc(requirements.position))
  )
    .filter((r) => keywords(`${r.title} ${r.description}`).some((w) => words.has(w)))
    .slice(0, 10)
    .map((r) => r.title);

  const instructions = String((run.input as { instructions?: string }).instructions ?? "");
  const input = {
    locale,
    project: { name: access.project.name, slug: access.project.slug },
    agent: {
      name: agent.name,
      type: agent.type,
      role: agent.role,
      capabilities: agent.capabilities,
      permissions: agent.permissions,
    },
    task: {
      id: task?.id ?? "",
      title: task?.title ?? "",
      description: task?.description ?? "",
      priority: task?.priority ?? "medium",
    },
    instructions,
    context: { prdExcerpt: prd ? prd.content.slice(0, 4000) : null, requirements: related },
    constraints: [
      "Propose changes only; a person approves them.",
      "No repository, deployment or external calls.",
    ],
    expectedOutput: "summary, changes, artifacts, recommendations, issues",
  };

  let result: AgentExecutionResult;
  try {
    result = await executeAgent(access, run, agent, input);
  } catch (error) {
    log.error("agent.executor_failed", { runId, error: String(error) });
    result = {
      status: "failed",
      summary: getAssistantCopy(locale).agent.failedSummary,
      changes: [],
      artifacts: [],
      recommendations: [],
      issues: [],
      needsApproval: false,
      simulated: false,
      steps: [],
      error: "executor_error",
    };
  }

  const finish = new EventBatch();
  await db.transaction(async (tx) => {
    const { run: current, taskTitle } = await lockRun(tx, access, runId);
    if (current.status !== "running") return; // Cancelled meanwhile: keep that decision.
    for (const step of result.steps)
      await tx
        .insert(agentRunEvents)
        .values({ runId, projectId: current.projectId, type: "AGENT_THINKING", data: { step } });
    const output = { ...result, changes: result.changes.length } as unknown as Record<
      string,
      unknown
    >;
    const withInput = {
      input: { ...input, instructions } as unknown as Record<string, unknown>,
      output,
    };

    if (result.status === "waiting_external") {
      const next = await transition(tx, current, "waiting", {
        ...withInput,
        metadata: { ...current.metadata, handoffId: result.handoffId ?? null },
      });
      await recordRunEvent(
        tx,
        next,
        "AGENT_WAITING",
        meta(agent, taskTitle, { reason: "external" }),
        access.actor.id,
        finish,
      );
      return;
    }
    if (result.status === "failed") {
      const next = await transition(tx, current, "failed", {
        ...withInput,
        error: result.error ?? "failed",
      });
      await recordRunEvent(
        tx,
        next,
        "AGENT_FAILED",
        meta(agent, taskTitle, { reason: result.error ?? "failed" }),
        access.actor.id,
        finish,
      );
      return;
    }
    if (result.changes.length > 0) {
      const copy = getAssistantCopy(locale);
      const proposal = await createProposalTx(
        tx,
        access,
        {
          type: "agent_result",
          title: copy.proposals.agentResult(agent.name, taskTitle ?? ""),
          description: result.summary,
          actions: result.changes,
          conversationId: current.conversationId,
          runId,
        },
        finish,
      );
      const next = await transition(tx, current, "waiting", {
        ...withInput,
        proposalId: proposal.id,
      });
      await recordRunEvent(
        tx,
        next,
        "AGENT_WAITING",
        meta(agent, taskTitle),
        access.actor.id,
        finish,
      );
      return;
    }
    const next = await transition(tx, current, "completed", withInput);
    await recordRunEvent(
      tx,
      next,
      "AGENT_COMPLETED",
      meta(agent, taskTitle),
      access.actor.id,
      finish,
    );
  });
  finish.flush();
}

/** Called inside the approval transaction of an agent's result proposal. */
export async function resolveRunReviewTx(
  tx: Tx,
  access: ProjectAccess,
  runId: string,
  outcome: "approved" | "rejected" | "revision_requested",
  batch: EventBatch,
) {
  const { run, agent, taskTitle } = await lockRun(tx, access, runId);
  if (run.status !== "waiting") return;
  if (outcome === "approved") {
    const next = await transition(tx, run, "completed");
    await recordRunEvent(
      tx,
      next,
      "AGENT_COMPLETED",
      meta(agent, taskTitle),
      access.actor.id,
      batch,
    );
  } else if (outcome === "rejected") {
    const next = await transition(tx, run, "cancelled", {
      metadata: { ...run.metadata, review: "rejected" },
    });
    await recordRunEvent(
      tx,
      next,
      "AGENT_CANCELLED",
      meta(agent, taskTitle, { review: "rejected" }),
      access.actor.id,
      batch,
    );
  } else {
    const next = await transition(tx, run, "blocked", {
      metadata: { ...run.metadata, review: "revision_requested" },
    });
    await recordRunEvent(
      tx,
      next,
      "AGENT_BLOCKED",
      meta(agent, taskTitle, { review: "revision_requested" }),
      access.actor.id,
      batch,
    );
  }
}
