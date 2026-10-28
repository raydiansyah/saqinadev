import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import * as z from "zod";
import { type Blocker, revertStep, type UndoStep, undoSteps } from "@/lib/assistant/actions/undo";
import { assistantMetadata } from "@/lib/assistant/blocks";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor, type Tx } from "@/lib/db/client";
import { conversationChanges, conversations, messages, proposals } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { parse } from "@/lib/validation";
import { getOwnConversation } from "./service";

const MAX_FORK_MESSAGES = 1000;
const point = z.object({ conversationId: z.uuid(), messageId: z.uuid() });

async function ownMessage(executor: Executor, conversationId: string, messageId: string) {
  const [row] = await executor
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.conversationId, conversationId),
        isNull(messages.rewoundAt),
      ),
    );
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** `(createdAt, id)` is the order the thread is shown in; this is "strictly after `p`". */
const after = (p: { createdAt: Date; id: string }) =>
  or(
    gt(messages.createdAt, p.createdAt),
    and(eq(messages.createdAt, p.createdAt), gt(messages.id, p.id)),
  );

const snippet = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

// ── Pin as chapter ───────────────────────────────────────────────────────────────────────

const pinInput = point.extend({ title: z.string().trim().min(1).max(80).optional() });

/** Marks a message as a chapter: a named place the thread can jump back to. */
export async function pinChapter(actor: Actor, slug: string, raw: unknown) {
  const input = parse(pinInput, raw);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:read", tx);
    await getOwnConversation(tx, access, input.conversationId);
    const message = await ownMessage(tx, input.conversationId, input.messageId);
    if (message.role !== "user" && message.role !== "assistant")
      throw new AppError("VALIDATION_ERROR");
    const title = input.title ?? (snippet(message.content, 60) || "Chapter");
    await tx
      .update(messages)
      .set({ pinnedAt: new Date(), chapterTitle: title })
      .where(eq(messages.id, message.id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "assistant.chapter_pinned",
      entityType: "conversation",
      entityId: input.conversationId,
      metadata: { messageId: message.id },
    });
    return { messageId: message.id, title };
  });
}

export async function unpinChapter(actor: Actor, slug: string, raw: unknown) {
  const input = parse(point, raw);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:read", tx);
    await getOwnConversation(tx, access, input.conversationId);
    const message = await ownMessage(tx, input.conversationId, input.messageId);
    await tx
      .update(messages)
      .set({ pinnedAt: null, chapterTitle: null })
      .where(eq(messages.id, message.id));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "assistant.chapter_unpinned",
      entityType: "conversation",
      entityId: input.conversationId,
      metadata: { messageId: message.id },
    });
    return { messageId: message.id };
  });
}

// ── Fork from here ───────────────────────────────────────────────────────────────────────

const forkInput = point.extend({ title: z.string().trim().min(1).max(80).optional() });

/**
 * Copies the thread up to and including a message into a new thread, so another direction can
 * be tried without touching the original. Plans, proposals and agent runs are not copied: a
 * fork starts with history only and has no changes of its own to undo.
 */
export async function forkConversation(actor: Actor, slug: string, raw: unknown) {
  const input = parse(forkInput, raw);
  return db.transaction(async (tx) => {
    const access = await loadProjectAccess(actor, { slug }, "project:read", tx);
    const parent = await getOwnConversation(tx, access, input.conversationId);
    const target = await ownMessage(tx, parent.id, input.messageId);
    const history = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, parent.id),
          isNull(messages.rewoundAt),
          lte(messages.createdAt, target.createdAt),
        ),
      )
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(MAX_FORK_MESSAGES + 1);
    // `lte` on the timestamp can include a later row with the same instant: cut at the target.
    const upTo = history.findIndex((m) => m.id === target.id);
    const copy = history.slice(0, upTo + 1);
    if (copy.length > MAX_FORK_MESSAGES) throw new AppError("VALIDATION_ERROR", "Thread too long");
    if (copy.some((m) => m.status === "processing" || m.status === "queued"))
      throw new AppError("CONFLICT", "Reply in progress");

    const [fork] = await tx
      .insert(conversations)
      .values({
        projectId: access.project.id,
        userId: access.actor.id,
        title: (input.title ?? `Fork: ${parent.title}`).slice(0, 80),
        contextType: parent.contextType,
        contextId: parent.contextId,
        parentConversationId: parent.id,
        forkedFromMessageId: target.id,
        memoryCursor: copy.at(-1)?.id ?? null,
      })
      .returning();
    await tx.insert(messages).values(
      copy.map((m) => {
        const meta = assistantMetadata.safeParse(m.metadata);
        return {
          conversationId: fork.id,
          role: m.role,
          content: m.content,
          status: m.status,
          createdAt: m.createdAt,
          pinnedAt: m.pinnedAt,
          chapterTitle: m.chapterTitle,
          // Proposal and run cards point at records of the original thread: leave them there.
          metadata: meta.success
            ? {
                ...meta.data,
                blocks: meta.data.blocks.filter(
                  (b) => b.type !== "proposal" && b.type !== "agent_run",
                ),
              }
            : {},
        };
      }),
    );
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "assistant.conversation_forked",
      entityType: "conversation",
      entityId: fork.id,
      metadata: { from: parent.id, messageId: target.id, copied: copy.length },
    });
    return { conversationId: fork.id, copied: copy.length };
  });
}

// ── Rewind ───────────────────────────────────────────────────────────────────────────────

export interface RewindPlan {
  /** Messages after the chosen one that will be hidden. */
  removedMessages: number;
  /** Proposals still waiting for review that will be cancelled. */
  cancelledProposals: number;
  /** Changes that will be put back, newest first. */
  undo: { op: UndoStep["op"]; kind: string; label: string }[];
  /** Anything here stops the rewind; nothing is changed. */
  blockers: Blocker[];
}

/** Thrown to roll the transaction back after a dry run or a blocked rewind. */
class Rollback extends Error {
  constructor(readonly plan: RewindPlan) {
    super("rollback");
  }
}

const summarize = (step: UndoStep): { kind: string; label: string } => {
  switch (step.op) {
    case "task.created":
    case "task.updated":
      return { kind: "task", label: step.after.title };
    case "requirement.created":
    case "requirement.updated":
      return { kind: "requirement", label: step.after.title };
    case "document.edited":
      return { kind: "document", label: step.title };
    case "irreversible":
      return { kind: step.action, label: step.label };
  }
};

async function runRewind(
  actor: Actor,
  slug: string,
  raw: unknown,
  dryRun: boolean,
): Promise<{ plan: RewindPlan; applied: boolean }> {
  const input = parse(point, raw);
  try {
    return await db.transaction(async (tx: Tx) => {
      const access = await loadProjectAccess(actor, { slug }, "content:write", tx);
      await getOwnConversation(tx, access, input.conversationId);
      // One rewind at a time per thread: a second click waits and then finds nothing to do.
      await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .for("update");
      const target = await ownMessage(tx, input.conversationId, input.messageId);
      const removed = await tx
        .select({ id: messages.id, status: messages.status })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, input.conversationId),
            isNull(messages.rewoundAt),
            after(target),
          ),
        );
      if (removed.length === 0) throw new AppError("VALIDATION_ERROR", "Nothing to rewind");
      if (removed.some((m) => m.status === "processing" || m.status === "queued"))
        throw new AppError("CONFLICT", "Reply in progress");
      const removedIds = removed.map((m) => m.id);

      const plan: RewindPlan = {
        removedMessages: removed.length,
        cancelledProposals: 0,
        undo: [],
        blockers: [],
      };
      const ledgers = await tx
        .select()
        .from(conversationChanges)
        .where(
          and(
            eq(conversationChanges.conversationId, input.conversationId),
            isNull(conversationChanges.undoneAt),
            inArray(conversationChanges.messageId, removedIds),
          ),
        )
        .orderBy(desc(conversationChanges.createdAt));
      const trace = { via: "assistant" as const, conversationId: input.conversationId };
      for (const ledger of ledgers) {
        const parsed = undoSteps.safeParse(ledger.steps);
        if (!parsed.success) {
          plan.blockers.push({ kind: "unknown", label: "", reason: "irreversible" });
          continue;
        }
        for (const step of [...parsed.data].reverse()) {
          const blocker = await revertStep(tx, access, step, trace);
          if (blocker) plan.blockers.push(blocker);
          else if (step.op !== "irreversible") plan.undo.push({ op: step.op, ...summarize(step) });
        }
      }
      const pending = await tx
        .select({ id: proposals.id })
        .from(proposals)
        .where(
          and(
            eq(proposals.projectId, access.project.id),
            eq(proposals.status, "pending"),
            inArray(proposals.messageId, removedIds),
          ),
        );
      plan.cancelledProposals = pending.length;
      if (dryRun || plan.blockers.length > 0) throw new Rollback(plan);

      const now = new Date();
      if (pending.length)
        await tx
          .update(proposals)
          .set({ status: "cancelled", reviewedBy: actor.id, reviewedAt: now })
          .where(
            inArray(
              proposals.id,
              pending.map((p) => p.id),
            ),
          );
      await tx
        .update(conversationChanges)
        .set({ undoneAt: now, undoneBy: actor.id })
        .where(
          inArray(
            conversationChanges.id,
            ledgers.map((l) => l.id),
          ),
        );
      await tx.update(messages).set({ rewoundAt: now }).where(inArray(messages.id, removedIds));
      // Anything that read the thread must not keep what was just taken back.
      const [conversation] = await tx
        .select({ cursor: conversations.memoryCursor })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId));
      await tx
        .update(conversations)
        .set({
          summary: null,
          summaryUpdatedAt: null,
          updatedAt: now,
          ...(conversation?.cursor && removedIds.includes(conversation.cursor)
            ? { memoryCursor: target.id }
            : {}),
        })
        .where(eq(conversations.id, input.conversationId));
      await recordAudit(tx, {
        actorId: actor.id,
        scope: "project",
        projectId: access.project.id,
        type: "assistant.conversation_rewound",
        entityType: "conversation",
        entityId: input.conversationId,
        metadata: {
          messageId: target.id,
          removedMessages: plan.removedMessages,
          undone: plan.undo.length,
          cancelledProposals: plan.cancelledProposals,
        },
      });
      return { plan, applied: true };
    });
  } catch (error) {
    if (error instanceof Rollback) return { plan: error.plan, applied: false };
    throw error;
  }
}

/** What a rewind to this message would do. Changes nothing. */
export async function previewRewind(actor: Actor, slug: string, raw: unknown) {
  return (await runRewind(actor, slug, raw, true)).plan;
}

/**
 * Goes back to a message: hides everything said after it and puts back every project change
 * the assistant made after it. All or nothing: if any change cannot be reversed (an invoice,
 * a client reminder, a record someone edited since), nothing is touched and the blockers are
 * returned.
 */
export async function rewindConversation(actor: Actor, slug: string, raw: unknown) {
  return runRewind(actor, slug, raw, false);
}

// ── Agent access ─────────────────────────────────────────────────────────────────────────

const accessInput = z.object({ conversationId: z.uuid(), enabled: z.boolean() });

/** The owner lets connected agents read this thread, or takes that back. Off by default. */
export async function setAgentAccess(actor: Actor, slug: string, raw: unknown) {
  const input = parse(accessInput, raw);
  return db.transaction(async (tx) => {
    const access: ProjectAccess = await loadProjectAccess(actor, { slug }, "project:read", tx);
    await getOwnConversation(tx, access, input.conversationId);
    await tx
      .update(conversations)
      .set({ agentAccess: input.enabled })
      .where(eq(conversations.id, input.conversationId));
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "project",
      projectId: access.project.id,
      type: "assistant.conversation_agent_access",
      entityType: "conversation",
      entityId: input.conversationId,
      metadata: { enabled: input.enabled },
    });
    return { enabled: input.enabled };
  });
}
