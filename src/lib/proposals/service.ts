import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import type { Locale } from "@/i18n/locales";
import { assignAgentTx, resolveRunReviewTx, startRun } from "@/lib/agents/orchestrator";
import { executeActionsTx } from "@/lib/assistant/actions/execute";
import { applyEdits } from "@/lib/assistant/actions/policies";
import { type PlannedAction, plannedActions } from "@/lib/assistant/actions/types";
import type { ExecutedItem } from "@/lib/assistant/blocks";
import { getAssistantCopy } from "@/lib/assistant/copy";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { agentRuns, agents, conversations, messages, proposals } from "@/lib/db/schema";
import type { AgentPermission } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { parse } from "@/lib/validation";
import { type ProposalRow, toView } from "./repository";

const approveInput = z.object({
  proposalId: z.uuid(),
  /** Reviewer edits keyed by action key: only whitelisted fields are applied. */
  edits: z.record(z.string().max(8), z.record(z.string().max(40), z.unknown())).default({}),
});

async function lockPending(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.projectId, projectId)))
    .for("update");
  if (!row) throw new AppError("NOT_FOUND");
  // A second click, another tab or a retry finds it already decided and changes nothing.
  if (row.status !== "pending") throw new AppError("CONFLICT", "Proposal already reviewed");
  return row;
}

/** Permissions of the agent whose run produced this proposal, if any. */
async function runAgentPermissions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: ProposalRow,
) {
  if (!row.runId) return undefined;
  const [hit] = await tx
    .select({ permissions: agents.permissions })
    .from(agentRuns)
    .innerJoin(agents, eq(agents.id, agentRuns.agentId))
    .where(eq(agentRuns.id, row.runId));
  return (hit?.permissions ?? []) as AgentPermission[];
}

/**
 * Applies a proposal exactly once. Edits, validation, execution, the status change and the
 * activity all happen in one transaction; agent runs created by the plan start after commit.
 */
export async function approveProposal(
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<{ items: ExecutedItem[]; runs: string[] }> {
  const { proposalId, edits } = parse(approveInput, input);
  const batch = new EventBatch();
  const { access, result } = await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const row = await lockPending(tx, access.project.id, proposalId);
    const stored = toView(row).actions;
    if (stored.length === 0)
      throw new AppError("VALIDATION_ERROR", "Proposal has no valid actions");
    const edited = plannedActions.safeParse(applyEdits(stored, edits));
    if (!edited.success)
      throw new AppError("VALIDATION_ERROR", "Invalid edits", { edits: "invalid" });
    const actions: PlannedAction[] = edited.data;

    const trace = {
      via: row.runId ? ("agent" as const) : ("assistant" as const),
      conversationId: row.conversationId,
      proposalId: row.id,
      runId: row.runId,
    };
    const result = await executeActionsTx(tx, access, actions, trace, batch, {
      assign: assignAgentTx,
      agentPermissions: await runAgentPermissions(tx, row),
    });
    await tx
      .update(proposals)
      .set({
        status: "approved",
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        payload: { actions },
        result: { items: result.items, runs: result.runs },
      })
      .where(eq(proposals.id, row.id));
    await batch.emit(tx, {
      type: "PROPOSAL_APPROVED",
      projectId: access.project.id,
      actorId: actor.id,
      entityType: "proposal",
      entityId: row.id,
      data: { title: row.title },
    });
    if (row.runId) await resolveRunReviewTx(tx, access, row.runId, "approved", batch);
    return { access, result };
  });
  batch.flush();
  for (const runId of result.runs) await startRun(access, runId);
  return result;
}

const reviewInput = z.object({
  proposalId: z.uuid(),
  note: z.string().trim().max(1000).default(""),
});

async function review(
  actor: Actor,
  slug: string,
  input: unknown,
  status: "rejected" | "revision_requested" | "cancelled",
  locale: Locale,
) {
  const { proposalId, note } = parse(reviewInput, input);
  const batch = new EventBatch();
  await db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
    const row = await lockPending(tx, access.project.id, proposalId);
    await tx
      .update(proposals)
      .set({ status, reviewedBy: actor.id, reviewedAt: new Date(), revisionNote: note || null })
      .where(eq(proposals.id, row.id));
    await batch.emit(tx, {
      type:
        status === "rejected"
          ? "PROPOSAL_REJECTED"
          : status === "cancelled"
            ? "PROPOSAL_CANCELLED"
            : "PROPOSAL_REVISION_REQUESTED",
      projectId: access.project.id,
      actorId: actor.id,
      entityType: "proposal",
      entityId: row.id,
      data: { title: row.title },
    });
    if (row.runId && status !== "cancelled")
      await resolveRunReviewTx(tx, access, row.runId, status, batch);
    // Revision requests continue the conversation so the user can say what to change.
    if (status === "revision_requested" && row.conversationId) {
      const copy = getAssistantCopy(locale);
      const [conversation] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, row.conversationId),
            eq(conversations.projectId, access.project.id),
          ),
        );
      if (conversation)
        await tx.insert(messages).values({
          conversationId: conversation.id,
          role: "assistant",
          content: copy.revisionAsk(row.title, note),
          metadata: { blocks: [] },
        });
    }
  });
  batch.flush();
}

export const rejectProposal = (actor: Actor, slug: string, input: unknown, locale: Locale) =>
  review(actor, slug, input, "rejected", locale);
export const requestRevision = (actor: Actor, slug: string, input: unknown, locale: Locale) =>
  review(actor, slug, input, "revision_requested", locale);
export const cancelProposal = (actor: Actor, slug: string, input: unknown, locale: Locale) =>
  review(actor, slug, input, "cancelled", locale);
