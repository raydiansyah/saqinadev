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
  createdAt: Date | string;
}

/** What the user is looking at when they ask. Ids are verified on the server. */
export interface ChatContext {
  type: ConversationContext;
  id: string | null;
  label: string;
}

export type Stage = "analyzing" | "context" | "preparing" | "writing";

export const PROJECT_CONTEXT: ChatContext = { type: "project", id: null, label: "" };
