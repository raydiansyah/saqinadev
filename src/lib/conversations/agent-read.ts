import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversationAgentReads, conversations, messages } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

const MAX_MESSAGES = 50;
const MAX_CHARS = 4000;

/** Threads the owner has opened to connected agents. Everything else stays private. */
export async function listSharedConversations(projectId: string) {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.projectId, projectId), eq(conversations.agentAccess, true)))
    .orderBy(desc(conversations.updatedAt))
    .limit(30);
}

/**
 * The latest messages of a shared thread, for an agent. Reading is recorded per agent (the newest
 * message it received), which is what the chat shows as "read by". A thread that is not shared
 * is NOT_FOUND, the same answer as one that does not exist. `agentId` is null for a member.
 */
export async function readConversationForAgent(input: {
  projectId: string;
  agentId: string | null;
  conversationId: string;
  limit?: number;
}) {
  if (!/^[0-9a-f-]{36}$/i.test(input.conversationId)) throw new AppError("NOT_FOUND");
  const [conversation] = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.projectId, input.projectId),
        eq(conversations.agentAccess, true),
      ),
    );
  if (!conversation) throw new AppError("NOT_FOUND");
  const rows = await db
    .select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.status, "completed"),
        isNull(messages.rewoundAt),
        inArray(messages.role, ["user", "assistant"]),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 20, 1), MAX_MESSAGES));
  const list = rows.reverse();
  const newest = list.at(-1)?.createdAt;
  if (input.agentId && newest)
    await db
      .insert(conversationAgentReads)
      .values({ conversationId: conversation.id, agentId: input.agentId, lastMessageAt: newest })
      .onConflictDoUpdate({
        target: [conversationAgentReads.conversationId, conversationAgentReads.agentId],
        // Never move backwards: a short read must not erase what was read before.
        set: {
          lastMessageAt: sql`greatest(${conversationAgentReads.lastMessageAt}, excluded.last_message_at)`,
          readAt: new Date(),
        },
      });
  return {
    id: conversation.id,
    title: conversation.title,
    messages: list.map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_CHARS),
      at: m.createdAt.toISOString(),
    })),
  };
}
