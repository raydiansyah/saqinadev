import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from "drizzle-orm";
import { listRuns, type RunView } from "@/lib/agents/runs";
import {
  type AssistantMetadata,
  assistantMetadata,
  type Block,
  type UserMetadata,
  userMetadata,
} from "@/lib/assistant/blocks";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor } from "@/lib/db/client";
import { agents, conversationAgentReads, conversations, messages } from "@/lib/db/schema";
import type { ConversationContext, MessageRole, MessageStatus } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import { listProposals, type ProposalView } from "@/lib/proposals/repository";

export type ConversationRow = typeof conversations.$inferSelect;

export interface MessageView {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  blocks: Block[];
  /** Which model answered (assistant messages). */
  model: AssistantMetadata["model"] | null;
  /** Set when the message is pinned as a chapter. */
  chapterTitle: string | null;
  createdAt: Date;
  /** Files sent with a user message. */
  attachments: UserMetadata["attachments"];
  /** Skills and connectors the person added as context. */
  use: UserMetadata["use"] | null;
}

export interface Chapter {
  messageId: string;
  title: string;
  createdAt: Date;
}

/** The newest message a connected agent has read, so each message can show who has seen it. */
export interface AgentRead {
  agentId: string;
  name: string;
  lastMessageAt: Date;
}

export interface ConversationInfo {
  id: string;
  title: string;
  /** The owner lets connected agents read this thread. */
  agentAccess: boolean;
  parent: { id: string; title: string } | null;
}

export interface ConversationListItem {
  id: string;
  title: string;
  contextType: ConversationContext;
  contextId: string | null;
  updatedAt: Date;
  lastMessage: string | null;
  /** Set on a fork. */
  parentConversationId: string | null;
}

export const MESSAGE_PAGE = 30;

/** Conversations are private to the member who started them, inside a project they can read. */
export async function getOwnConversation(
  executor: Executor,
  access: ProjectAccess,
  id: string,
): Promise<ConversationRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("NOT_FOUND");
  const [row] = await executor
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.projectId, access.project.id),
        eq(conversations.userId, access.actor.id),
      ),
    );
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/**
 * Continues the latest conversation about the same thing instead of opening a new thread
 * for every question, unless the user explicitly starts a new one.
 */
export async function findOrCreateConversation(
  executor: Executor,
  access: ProjectAccess,
  input: {
    conversationId?: string | null;
    fresh?: boolean;
    context: { type: ConversationContext; id: string | null };
    title: string;
  },
): Promise<ConversationRow> {
  if (input.conversationId) return getOwnConversation(executor, access, input.conversationId);
  if (!input.fresh) {
    const [latest] = await executor
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.projectId, access.project.id),
          eq(conversations.userId, access.actor.id),
          eq(conversations.contextType, input.context.type),
          input.context.id
            ? eq(conversations.contextId, input.context.id)
            : isNull(conversations.contextId),
        ),
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    if (latest) return latest;
  }
  const [row] = await executor
    .insert(conversations)
    .values({
      projectId: access.project.id,
      userId: access.actor.id,
      title: input.title.slice(0, 80),
      contextType: input.context.type,
      contextId: input.context.id,
    })
    .returning();
  return row;
}

export async function listConversations(
  access: ProjectAccess,
  limit = 30,
): Promise<ConversationListItem[]> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      contextType: conversations.contextType,
      contextId: conversations.contextId,
      updatedAt: conversations.updatedAt,
      parentConversationId: conversations.parentConversationId,
      // `${conversations}.id` keeps the qualifier: a bare column here would resolve to `m.id`.
      lastMessage: sql<string | null>`(
        select m.content from ${messages} m
        where m.conversation_id = ${conversations}.id and m.content <> ''
          and m.rewound_at is null
        order by m.created_at desc limit 1)`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.projectId, access.project.id),
        eq(conversations.userId, access.actor.id),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
  return rows;
}

function toMessageView(row: typeof messages.$inferSelect): MessageView {
  const meta = assistantMetadata.safeParse(row.metadata);
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status,
    blocks: meta.success ? meta.data.blocks : [],
    model: meta.success ? (meta.data.model ?? null) : null,
    chapterTitle: row.pinnedAt ? (row.chapterTitle ?? "") : null,
    createdAt: row.createdAt,
    ...userParts(row),
  };
}

function userParts(row: typeof messages.$inferSelect) {
  if (row.role !== "user") return { attachments: [], use: null };
  const meta = userMetadata.safeParse(row.metadata);
  return meta.success
    ? { attachments: meta.data.attachments, use: meta.data.use }
    : { attachments: [], use: null };
}

/**
 * A page of messages (newest page first, returned oldest-first for display) plus the live
 * state of any proposals and agent runs the blocks refer to.
 */
export async function loadMessages(
  access: ProjectAccess,
  conversationId: string,
  before?: { createdAt: Date; id: string },
): Promise<{
  messages: MessageView[];
  hasMore: boolean;
  proposals: ProposalView[];
  runs: RunView[];
  chapters: Chapter[];
  agentReads: AgentRead[];
  conversation: ConversationInfo;
}> {
  const conversation = await getOwnConversation(db, access, conversationId);
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.rewoundAt),
        before ? lt(messages.createdAt, before.createdAt) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(MESSAGE_PAGE + 1);
  const page = rows.slice(0, MESSAGE_PAGE).reverse().map(toMessageView);
  return {
    messages: page,
    hasMore: rows.length > MESSAGE_PAGE,
    ...(await hydrate(access, page)),
    chapters: await listChapters(conversationId),
    agentReads: await listAgentReads(conversationId),
    conversation: await conversationInfo(access, conversation),
  };
}

/** Pinned messages in the order they were said, whether or not they are on the loaded page. */
export async function listChapters(conversationId: string): Promise<Chapter[]> {
  const rows = await db
    .select({ id: messages.id, title: messages.chapterTitle, createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.rewoundAt),
        isNotNull(messages.pinnedAt),
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return rows.map((r) => ({ messageId: r.id, title: r.title ?? "", createdAt: r.createdAt }));
}

export async function listAgentReads(conversationId: string): Promise<AgentRead[]> {
  return db
    .select({
      agentId: conversationAgentReads.agentId,
      name: agents.name,
      lastMessageAt: conversationAgentReads.lastMessageAt,
    })
    .from(conversationAgentReads)
    .innerJoin(agents, eq(agents.id, conversationAgentReads.agentId))
    .where(eq(conversationAgentReads.conversationId, conversationId));
}

async function conversationInfo(
  access: ProjectAccess,
  conversation: ConversationRow,
): Promise<ConversationInfo> {
  let parent: ConversationInfo["parent"] = null;
  if (conversation.parentConversationId) {
    const [row] = await db
      .select({ id: conversations.id, title: conversations.title })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversation.parentConversationId),
          eq(conversations.projectId, access.project.id),
          eq(conversations.userId, access.actor.id),
        ),
      );
    parent = row ?? null;
  }
  return {
    id: conversation.id,
    title: conversation.title,
    agentAccess: conversation.agentAccess,
    parent,
  };
}

/** Loads the proposals and runs referenced by blocks, scoped to the project. */
export async function hydrate(access: ProjectAccess, list: MessageView[]) {
  const proposalIds = new Set<string>();
  const runIds = new Set<string>();
  for (const m of list)
    for (const b of m.blocks) {
      if (b.type === "proposal") proposalIds.add(b.proposalId);
      if (b.type === "agent_run") runIds.add(b.runId);
    }
  const [proposalViews, runViews] = await Promise.all([
    listProposals(access, { ids: [...proposalIds] }),
    listRuns(access, { ids: [...runIds] }),
  ]);
  // Agent runs started from an approved proposal show up under that proposal.
  const fromProposals = proposalViews.flatMap(
    (p) => (p.result?.runs as string[] | undefined) ?? [],
  );
  const extra = fromProposals.filter((id) => !runIds.has(id));
  const more = extra.length ? await listRuns(access, { ids: extra }) : [];
  return { proposals: proposalViews, runs: [...runViews, ...more] };
}

/** The clarification Saqina is waiting on, if its last reply (before `beforeId`) asked one. */
export async function lastPending(
  conversationId: string,
  beforeId: string,
): Promise<AssistantMetadata["pending"] | null> {
  const [row] = await db
    .select({ metadata: messages.metadata, role: messages.role })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.status, "completed"),
        isNull(messages.rewoundAt),
        ne(messages.id, beforeId),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!row || row.role !== "assistant") return null;
  const meta = assistantMetadata.safeParse(row.metadata);
  return meta.success ? (meta.data.pending ?? null) : null;
}

export async function recentHistory(conversationId: string, limit = 6) {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.status, "completed"),
        isNull(messages.rewoundAt),
        inArray(messages.role, ["user", "assistant"]),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows
    .reverse()
    .filter((r) => r.content)
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

const SUMMARY_AFTER = 20;

/**
 * Lightweight deterministic summary for long threads: the user's recent requests. Stored on
 * the conversation so context building can include it instead of the whole history.
 */
export async function refreshSummary(conversation: ConversationRow): Promise<string | null> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        isNull(messages.rewoundAt),
        conversation.summaryUpdatedAt
          ? gt(messages.createdAt, conversation.summaryUpdatedAt)
          : undefined,
      ),
    );
  if (n < SUMMARY_AFTER) return conversation.summary;
  const requests = await db
    .select({ content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.role, "user"),
        isNull(messages.rewoundAt),
      ),
    )
    .orderBy(asc(messages.createdAt));
  const summary = requests
    .slice(-15)
    .map((r) => `- ${r.content.slice(0, 120)}`)
    .join("\n");
  await db
    .update(conversations)
    .set({ summary, summaryUpdatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));
  return summary;
}
