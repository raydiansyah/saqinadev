import "server-only";
import { eq } from "drizzle-orm";
import type { UndoStep } from "@/lib/assistant/actions/undo";
import { undoSteps } from "@/lib/assistant/actions/undo";
import type { Executor } from "@/lib/db/client";
import { conversationChanges, conversations } from "@/lib/db/schema";

/**
 * Keeps the undo ledger for what the assistant changed while answering one message. Written in
 * the same transaction as the change, so a change never exists without its way back. A plan
 * with no steps, or one that did not come from a conversation, leaves no row.
 */
export async function recordChangesTx(
  tx: Executor,
  input: {
    projectId: string;
    conversationId: string | null | undefined;
    messageId: string | null | undefined;
    proposalId?: string | null;
    steps: UndoStep[];
  },
): Promise<void> {
  if (!input.conversationId || input.steps.length === 0) return;
  // A proposal can outlive its thread; without the thread there is nothing to rewind.
  const [conversation] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId));
  if (!conversation) return;
  await tx.insert(conversationChanges).values({
    projectId: input.projectId,
    conversationId: input.conversationId,
    messageId: input.messageId ?? null,
    proposalId: input.proposalId ?? null,
    steps: undoSteps.parse(input.steps),
  });
}
