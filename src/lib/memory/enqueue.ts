import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { conversations, memoryJobs, messages } from "@/lib/db/schema";
import type { MemoryKind } from "@/lib/domain/memory";
import { CONSOLIDATE_AFTER, uncitedFacts } from "./consolidate";
import { selectWindow } from "./extract/plan";
import { enqueue } from "./queue";

/**
 * What queues memory work, kept apart from what runs it: pages and services that only need to ask
 * for a job must not pull in the runner, and with it the code parser.
 */
const MIN_NEW_MESSAGES = 4;

/**
 * Queues an extraction when a conversation has gathered enough new messages. Cheap to call after
 * every reply: it counts, and only queues past the threshold.
 */
export async function maybeEnqueueExtraction(
  executor: Executor,
  input: { projectId: string; conversationId: string },
): Promise<boolean> {
  // One extraction at a time per conversation: a backlog or an outage must not multiply model calls.
  const [open] = await executor
    .select({ id: memoryJobs.id })
    .from(memoryJobs)
    .where(
      and(
        eq(memoryJobs.kind, "extract_chat"),
        inArray(memoryJobs.status, ["queued", "processing", "failed_retryable"]),
        sql`${memoryJobs.input}->>'conversationId' = ${input.conversationId}`,
      ),
    )
    .limit(1);
  if (open) return false;
  const cursor = await lastExtractedMessageId(executor, input.conversationId);
  const rows = await executor
    .select({ id: messages.id, role: messages.role })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        eq(messages.status, "completed"),
        isNull(messages.rewoundAt),
      ),
    )
    .orderBy(asc(messages.createdAt));
  const fresh = selectWindow(
    rows.map((r) => ({ id: r.id, role: r.role === "user" ? "user" : "assistant", content: "" })),
    cursor,
  );
  const last = fresh.at(-1);
  if (!last || fresh.filter((m) => m.role === "user").length < MIN_NEW_MESSAGES) return false;
  return enqueue(executor, {
    projectId: input.projectId,
    kind: "extract_chat",
    key: `extract:${input.conversationId}:${last.id}`,
    data: { conversationId: input.conversationId, toMessageId: last.id },
  });
}

export async function maybeEnqueueConsolidation(
  executor: Executor,
  input: { projectId: string; kind: MemoryKind; lastAssetId: string },
): Promise<boolean> {
  const facts = await uncitedFacts(executor, input.projectId, input.kind);
  if (facts.length < CONSOLIDATE_AFTER) return false;
  return enqueue(executor, {
    projectId: input.projectId,
    kind: "consolidate",
    key: `consolidate:${input.projectId}:${input.kind}:${input.lastAssetId}`,
    data: { kind: input.kind },
  });
}

export async function lastExtractedMessageId(executor: Executor, conversationId: string) {
  const [row] = await executor
    .select({ cursor: conversations.memoryCursor })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  return row?.cursor ?? null;
}
