import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { type PlannedAction, plannedActions, summarizeRisk } from "@/lib/assistant/actions/types";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor } from "@/lib/db/client";
import { proposals, users } from "@/lib/db/schema";
import type { ProposalStatus } from "@/lib/domain/enums";
import type { EventBatch } from "@/lib/events/emitter";

export type ProposalRow = typeof proposals.$inferSelect;

export interface ProposalView {
  id: string;
  type: string;
  title: string;
  description: string;
  actions: PlannedAction[];
  category: ProposalRow["category"];
  riskLevel: ProposalRow["riskLevel"];
  status: ProposalStatus;
  conversationId: string | null;
  runId: string | null;
  revisionNote: string | null;
  result: Record<string, unknown> | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewerName: string | null;
}

export interface NewProposal {
  type: "assistant" | "agent_result";
  title: string;
  description: string;
  actions: PlannedAction[];
  conversationId?: string | null;
  messageId?: string | null;
  runId?: string | null;
}

/** Stores a plan for review. The plan is validated before it is written, not only when applied. */
export async function createProposalTx(
  tx: Executor,
  access: ProjectAccess,
  input: NewProposal,
  batch: EventBatch,
): Promise<ProposalRow> {
  const actions = plannedActions.parse(input.actions);
  const { category, risk } = summarizeRisk(actions);
  const [row] = await tx
    .insert(proposals)
    .values({
      projectId: access.project.id,
      type: input.type,
      title: input.title.slice(0, 200),
      description: input.description,
      payload: { actions },
      category,
      riskLevel: risk,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      runId: input.runId ?? null,
      createdBy: access.actor.id,
    })
    .returning();
  await batch.emit(tx, {
    type: "PROPOSAL_CREATED",
    projectId: access.project.id,
    actorId: access.actor.id,
    entityType: "proposal",
    entityId: row.id,
    data: { title: row.title, risk, category },
  });
  return row;
}

export function toView(row: ProposalRow, reviewerName: string | null = null): ProposalView {
  const parsed = plannedActions.safeParse((row.payload as { actions?: unknown }).actions);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    actions: parsed.success ? parsed.data : [],
    category: row.category,
    riskLevel: row.riskLevel,
    status: row.status,
    conversationId: row.conversationId,
    runId: row.runId,
    revisionNote: row.revisionNote,
    result: row.result ?? null,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    reviewerName,
  };
}

export async function listProposals(
  access: ProjectAccess,
  options: { status?: ProposalStatus[]; ids?: string[]; limit?: number } = {},
): Promise<ProposalView[]> {
  if (options.ids && options.ids.length === 0) return [];
  const rows = await db
    .select({ proposal: proposals, reviewer: users.name })
    .from(proposals)
    .leftJoin(users, eq(users.id, proposals.reviewedBy))
    .where(
      and(
        eq(proposals.projectId, access.project.id),
        options.status ? inArray(proposals.status, options.status) : undefined,
        options.ids ? inArray(proposals.id, options.ids) : undefined,
      ),
    )
    .orderBy(desc(proposals.createdAt))
    .limit(options.limit ?? 50);
  return rows.map((r) => toView(r.proposal, r.reviewer));
}
