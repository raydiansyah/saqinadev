import type { AgentOption } from "@/lib/agents/options";
import type { RunView } from "@/lib/agents/runs";
import type { Block } from "@/lib/assistant/blocks";
import type { ConversationContext, MessageRole, MessageStatus } from "@/lib/domain/enums";
import type { ProposalView } from "@/lib/proposals/repository";

export type { AgentOption, Block, ProposalView, RunView };

export interface UIMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  blocks: Block[];
  model?: { label: string; source: string; fallbackUsed: boolean; requested: string | null } | null;
  /** Set when the message is pinned as a chapter. */
  chapterTitle?: string | null;
  createdAt: Date | string;
  /** Files sent with a user message. */
  attachments?: {
    id: string;
    name: string;
    mime: string;
    size: number;
    kind: "text" | "image" | "pdf";
  }[];
  /** Skills and connectors added as context. */
  use?: { skills: string[]; connectors: string[] } | null;
}

export interface ChapterItem {
  messageId: string;
  title: string;
  createdAt: Date | string;
}

/** The newest message a connected agent has read. */
export interface AgentReadItem {
  agentId: string;
  name: string;
  lastMessageAt: Date | string;
}

export interface ConversationMeta {
  id: string;
  title: string;
  agentAccess: boolean;
  parent: { id: string; title: string } | null;
}

/** What a rewind would do; mirrors `RewindPlan` on the server. */
export interface RewindPreview {
  removedMessages: number;
  cancelledProposals: number;
  undo: { op: string; kind: string; label: string }[];
  blockers: { kind: string; label: string; reason: "irreversible" | "changed" | "missing" }[];
}

/** What the user is looking at when they ask. Ids are verified on the server. */
export interface ChatContext {
  type: ConversationContext;
  id: string | null;
  label: string;
}

export type Stage = "analyzing" | "context" | "preparing" | "writing";

export const PROJECT_CONTEXT: ChatContext = { type: "project", id: null, label: "" };
