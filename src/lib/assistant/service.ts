import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { LOCALES, type Locale } from "@/i18n/locales";
import { assignAgentTx, startRun } from "@/lib/agents/orchestrator";
import { EXECUTABLE_TYPES } from "@/lib/agents/registry";
import { MockAiProvider } from "@/lib/ai/mock";
import type { AiProvider } from "@/lib/ai/provider";
import { getAiProvider } from "@/lib/ai/registry";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import {
  findOrCreateConversation,
  lastPending,
  recentHistory,
  refreshSummary,
} from "@/lib/conversations/service";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { CONVERSATION_CONTEXTS } from "@/lib/domain/enums";
import { errorRef, isAppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { log } from "@/lib/log";
import { getNextProjectAction } from "@/lib/projects/progress";
import { createProposalTx } from "@/lib/proposals/repository";
import { parse } from "@/lib/validation";
import projectEn from "../../../messages/project.en.json";
import projectId from "../../../messages/project.id.json";
import { executeActionsTx } from "./actions/execute";
import { executionMode } from "./actions/policies";
import { ACTION_POLICY } from "./actions/types";
import {
  type AssistantMetadata,
  type Block,
  block as blockSchema,
  type StreamEvent,
} from "./blocks";
import { buildContext, contextSegments, resolveEntity } from "./context-builder";
import { getAssistantCopy } from "./copy";
import { classifyIntent } from "./intents/classifier";
import { priorityIn } from "./intents/rules";
import type { IntentClassification, PendingIntent } from "./intents/types";
import { type PlanOutcome, plan } from "./planner";

export const messageInput = z.object({
  conversationId: z.uuid().nullish(),
  /** Start a new thread instead of continuing the latest one for this context. */
  fresh: z.boolean().optional(),
  clientId: z.uuid(),
  content: z.string().trim().min(1).max(4000),
  context: z
    .object({ type: z.enum(CONVERSATION_CONTEXTS), id: z.string().max(80).nullable() })
    .nullish(),
  locale: z.enum(LOCALES),
});
export type MessageInput = z.infer<typeof messageInput>;

const PROJECT_MESSAGES = { en: projectEn.project, id: projectId.project } as const;

/** A short follow-up answers the question Saqina asked last; a clear new command does not. */
export function mergePending(
  c: IntentClassification,
  pending: PendingIntent | null,
  message: string,
): IntentClassification {
  if (!pending) return c;
  if (c.confidence >= 0.8 && c.intent !== "HELP") return c;
  const entities = { ...pending.entities };
  const text = message.trim();
  if (pending.question === "title") entities.title = text.slice(0, 200);
  else if (pending.question === "feature") entities.feature = text.slice(0, 160);
  else if (pending.question === "priority")
    entities.priority = priorityIn(text.toLowerCase()) ?? entities.priority;
  else entities.description = text.slice(0, 2000);
  return { intent: pending.intent, confidence: 1, entities };
}

const SYSTEM = (locale: Locale) =>
  [
    "You are Saqina, the assistant inside a software project workspace.",
    `Reply in ${locale === "id" ? "Indonesian" : "English"}, in at most 120 words, without filler.`,
    "Use only the project data and the application draft provided. The draft is correct: keep",
    "its facts and its labels. Never present inferred or recommended items as confirmed, never",
    "invent requirements, decisions or reasons, and never claim that anything was executed,",
    "deployed or changed. If the draft says something is unknown, say it is unknown.",
  ].join(" ");

interface Emit {
  (event: StreamEvent): void;
}

/**
 * The conversation pipeline: message → intent → context → plan → (execute | propose | answer)
 * → reply. Every mutation goes through the same validated executor as the rest of the app.
 */
export async function handleMessage(
  actor: Actor,
  slug: string,
  raw: unknown,
  emit: Emit,
  options: { signal?: AbortSignal; provider?: AiProvider } = {},
): Promise<{ messageId: string; mutated: boolean }> {
  const input = parse(messageInput, raw);
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  const entity = await resolveEntity(access, input.context ?? null);
  const copy = getAssistantCopy(input.locale);

  // Persist the user's message first. A resend with the same clientId changes nothing.
  const setup = await db.transaction(async (tx) => {
    const conversation = await findOrCreateConversation(tx, access, {
      conversationId: input.conversationId,
      fresh: input.fresh,
      context: { type: entity.type, id: entity.id },
      title: input.content,
    });
    const [user] = await tx
      .insert(messages)
      .values({
        conversationId: conversation.id,
        clientId: input.clientId,
        role: "user",
        content: input.content,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!user) return { conversation, user: null, reply: null };
    const [reply] = await tx
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: "assistant",
        status: "processing",
        // Same transaction means the same now(); keep the reply strictly after the question.
        createdAt: new Date(user.createdAt.getTime() + 1),
        metadata: { blocks: [], replyTo: user.id },
      })
      .returning();
    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    return { conversation, user, reply };
  });
  if (!setup.user || !setup.reply) {
    emit({ type: "done", messageId: "", mutated: false });
    return { messageId: "", mutated: false };
  }
  const { conversation, user, reply } = setup;
  emit({
    type: "started",
    conversationId: conversation.id,
    userMessageId: user.id,
    messageId: reply.id,
  });

  const blocks: Block[] = [];
  let text = "";
  let mutated = false;
  const meta: AssistantMetadata = {
    blocks,
    context: { type: entity.type, id: entity.id, title: entity.title },
  };
  const pushBlock = (b: Block) => {
    const valid = blockSchema.parse(b);
    blocks.push(valid);
    emit({ type: "block", block: valid });
  };

  try {
    emit({ type: "status", stage: "analyzing" });
    const provider = options.provider ?? getAiProvider();
    const pending = (await lastPending(conversation.id, user.id)) ?? null;
    const classified = mergePending(
      await classifyIntent(input.content, { entity }, provider, options.signal),
      pending,
      input.content,
    );
    meta.intent = classified.intent;
    meta.confidence = classified.confidence;
    meta.provider = provider.config.provider;

    emit({ type: "status", stage: "context" });
    const summary = await refreshSummary(conversation);
    const ctx = await buildContext(access, classified.intent, entity, summary);
    const pm = PROJECT_MESSAGES[input.locale];
    const outcome = plan(classified, ctx, copy, {
      status:
        pm.statuses[access.project.status as keyof typeof pm.statuses] ?? access.project.status,
      next: pm.nextActions[getNextProjectAction(ctx.snapshot).kind],
      executableTypes: EXECUTABLE_TYPES,
    });

    emit({ type: "status", stage: "preparing" });
    const draft = await applyOutcome(outcome, access, ctx.approvalPolicy, {
      conversationId: conversation.id,
      messageId: reply.id,
      copy,
      pushBlock,
      meta,
      onMutated: () => {
        mutated = true;
      },
    });

    emit({ type: "status", stage: "writing" });
    // Only read-only answers are phrased by a model; action results stay exactly as executed.
    if (outcome.kind === "answer" && !provider.deterministic) {
      text = await streamModel(
        provider,
        {
          system: SYSTEM(input.locale),
          segments: contextSegments(ctx),
          history: await recentHistory(conversation.id),
          userMessage: input.content,
          draft,
          signal: options.signal,
        },
        emit,
        copy.modelFallback,
        draft,
      );
    } else {
      for await (const part of new MockAiProvider().stream({
        system: "",
        segments: [],
        userMessage: "",
        draft,
        signal: options.signal,
      })) {
        text += part;
        emit({ type: "delta", text: part });
      }
    }
    if (options.signal?.aborted) throw new AbortError();

    await db
      .update(messages)
      .set({ content: text, status: "completed", metadata: { ...meta, replyTo: user.id } })
      .where(eq(messages.id, reply.id));
    emit({ type: "done", messageId: reply.id, mutated });
    return { messageId: reply.id, mutated };
  } catch (error) {
    const aborted = error instanceof AbortError || options.signal?.aborted;
    const code = isAppError(error) ? error.code : aborted ? "CANCELLED" : "INTERNAL_ERROR";
    const ref = code === "INTERNAL_ERROR" ? errorRef() : undefined;
    if (!aborted) log.error("assistant.failed", { ref, code, error: String(error) });
    blocks.push({ type: "error", code, ref });
    await db
      .update(messages)
      .set({
        content: text,
        status: aborted ? "cancelled" : "failed",
        metadata: { ...meta, replyTo: user.id },
      })
      .where(and(eq(messages.id, reply.id)));
    emit({ type: "error", code, ref });
    return { messageId: reply.id, mutated };
  }
}

class AbortError extends Error {}

async function streamModel(
  provider: AiProvider,
  request: Parameters<AiProvider["stream"]>[0],
  emit: Emit,
  fallbackNote: string,
  draft: string,
): Promise<string> {
  let text = "";
  try {
    for await (const part of provider.stream(request)) {
      text += part;
      emit({ type: "delta", text: part });
    }
    if (!text.trim()) throw new Error("empty");
    return text;
  } catch (error) {
    if (request.signal?.aborted) throw new AbortError();
    log.warn("assistant.model_fallback", { error: String(error) });
    const rest = text ? `\n\n${fallbackNote}` : `${draft}\n\n${fallbackNote}`;
    emit({ type: "delta", text: rest });
    return text + rest;
  }
}

/** Runs or stores the plan and returns the reply draft. Mutations re-check write access. */
async function applyOutcome(
  outcome: PlanOutcome,
  access: ProjectAccess,
  policy: "auto_low_risk" | "always",
  env: {
    conversationId: string;
    messageId: string;
    copy: ReturnType<typeof getAssistantCopy>;
    pushBlock: (b: Block) => void;
    meta: AssistantMetadata;
    onMutated: () => void;
  },
): Promise<string> {
  const { copy, pushBlock } = env;
  if (outcome.kind === "answer") {
    for (const b of outcome.blocks) pushBlock(b);
    return outcome.draft;
  }
  if (outcome.kind === "clarify") {
    env.meta.pending = outcome.pending;
    if (outcome.options.length)
      pushBlock({ type: "question", question: outcome.draft, options: outcome.options });
    return outcome.draft;
  }

  const mode = executionMode(outcome.actions, policy, access.role);
  if (mode === "forbidden") return copy.viewerForbidden;

  const batch = new EventBatch();
  const trace = { via: "assistant" as const, conversationId: env.conversationId };
  const result = await db.transaction(async (tx) => {
    // Re-authorize inside the write transaction: membership may have changed since the read.
    const writer = await loadProjectAccess(
      access.actor,
      { id: access.project.id },
      "content:write",
      tx,
    );
    if (mode === "auto") {
      const executed = await executeActionsTx(tx, writer, outcome.actions, trace, batch, {
        assign: assignAgentTx,
      });
      return { kind: "executed" as const, executed };
    }
    const proposal = await createProposalTx(
      tx,
      writer,
      {
        type: "assistant",
        title: outcome.title,
        description: outcome.description,
        actions: outcome.actions,
        conversationId: env.conversationId,
        messageId: env.messageId,
      },
      batch,
    );
    return { kind: "proposed" as const, proposalId: proposal.id };
  });
  batch.flush();

  if (result.kind === "executed") {
    env.onMutated();
    pushBlock({ type: "action", items: result.executed.items });
    for (const runId of result.executed.runs) {
      await startRun(access, runId);
      pushBlock({ type: "agent_run", runId });
    }
    return copy.executed(result.executed.items.length);
  }
  pushBlock({ type: "proposal", proposalId: result.proposalId });
  const destructive = outcome.actions.some((a) => ACTION_POLICY[a.type].category === "destructive");
  return destructive ? copy.proposalDestructive : copy.proposalIntro;
}
