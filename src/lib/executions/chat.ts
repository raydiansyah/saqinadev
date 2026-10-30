import "server-only";
import { eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { findOrCreateConversation } from "@/lib/conversations/service";
import type { Tx } from "@/lib/db/client";
import { conversations, executions, messages } from "@/lib/db/schema";
import type { ExecutionRow } from "./types";

/**
 * Puts a started execution into the conversation: the person's instruction, then an assistant
 * message whose only content is the live card of the execution. The messages are stored with the
 * execution, so they are still there after a reload or a change of tab.
 */
export async function recordExecutionInChat(
  tx: Tx,
  access: ProjectAccess,
  execution: ExecutionRow,
  conversationId: string | null,
): Promise<ExecutionRow> {
  const conversation = await findOrCreateConversation(tx, access, {
    conversationId,
    context: { type: "project", id: null },
    title: execution.request,
  });
  const [user] = await tx
    .insert(messages)
    .values({
      conversationId: conversation.id,
      role: "user",
      content: execution.request,
      metadata: { use: { skills: [], connectors: [] }, mode: execution.mode },
    })
    .returning();
  const [reply] = await tx
    .insert(messages)
    .values({
      conversationId: conversation.id,
      role: "assistant",
      status: "completed",
      createdAt: new Date(user.createdAt.getTime() + 1),
      metadata: {
        blocks: [{ type: "execution", executionId: execution.id }],
        replyTo: user.id,
      },
    })
    .returning();
  await tx
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));
  const [row] = await tx
    .update(executions)
    .set({ conversationId: conversation.id, messageId: reply.id })
    .where(eq(executions.id, execution.id))
    .returning();
  return row;
}
