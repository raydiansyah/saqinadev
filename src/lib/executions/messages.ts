import "server-only";
import { count, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { agentMessages } from "@/lib/db/schema";
import type { AgentMessageType } from "@/lib/domain/executions";
import { AppError } from "@/lib/errors";
import { scrubSecrets } from "@/lib/secrets/scan";
import { appendEvent } from "./events";
import type { Scope } from "./types";

/** Most messages one execution may hold. Stops two agents from answering each other without end. */
export const MESSAGE_BUDGET = 400;
const MAX_BODY = 4000;

/** Messages that pass work from one agent to another, so only a listed handoff target may get one. */
const BETWEEN_AGENTS: readonly AgentMessageType[] = [
  "handoff",
  "info_request",
  "review_request",
  "review_feedback",
  "test_result",
  "decision",
];
/** The ones the Studio draws as a handoff arrow. */
const HANDOFFS: readonly AgentMessageType[] = ["handoff", "review_request", "review_feedback"];

export interface MessageParty {
  id: string;
  /** Key of the agent's definition; what `handoffTargets` lists. */
  definitionKey: string | null;
  handoffTargets: readonly string[];
}

export interface MessageInput {
  taskId?: string | null;
  /** Null: the orchestrator wrote it. */
  from: MessageParty | null;
  /** Null: the orchestrator, or everyone in the execution. */
  to: Pick<MessageParty, "id" | "definitionKey"> | null;
  type: AgentMessageType;
  body: string;
  artifactRefs?: string[];
  replyToId?: string | null;
  /** The same fact sent twice is stored once. */
  key: string;
}

/**
 * Stores a message and announces it. Returns `created: false` when the same key was already
 * stored (a retried step, a replayed event). An agent can only hand work to an agent its
 * definition lists, and an execution holds a bounded number of messages.
 */
export async function postMessage(
  tx: Executor,
  scope: Scope,
  input: MessageInput,
): Promise<{ id: string | null; created: boolean }> {
  if (input.from && input.to && BETWEEN_AGENTS.includes(input.type)) {
    const allowed =
      input.to.definitionKey && input.from.handoffTargets.includes(input.to.definitionKey);
    if (!allowed)
      throw new AppError("AUTHORIZATION_ERROR", "Handoff target not allowed", {
        to: "handoffTarget",
      });
  }
  const [{ n }] = await tx
    .select({ n: count() })
    .from(agentMessages)
    .where(eq(agentMessages.executionId, scope.executionId));
  if (n >= MESSAGE_BUDGET)
    throw new AppError("CONFLICT", "Message budget used", { budget: "messages" });

  const body = scrubSecrets(input.body).slice(0, MAX_BODY);
  const [row] = await tx
    .insert(agentMessages)
    .values({
      projectId: scope.projectId,
      executionId: scope.executionId,
      taskId: input.taskId ?? null,
      fromAgentId: input.from?.id ?? null,
      toAgentId: input.to?.id ?? null,
      type: input.type,
      body,
      artifactRefs: input.artifactRefs ?? [],
      replyToId: input.replyToId ?? null,
      idempotencyKey: input.key,
    })
    .onConflictDoNothing()
    .returning({ id: agentMessages.id });
  if (!row) return { id: null, created: false };

  const summary = {
    messageId: row.id,
    type: input.type,
    taskId: input.taskId ?? null,
    from: input.from?.id ?? null,
    to: input.to?.id ?? null,
    body: body.slice(0, 300),
  };
  await appendEvent(tx, scope, "agent.message_created", summary);
  if (HANDOFFS.includes(input.type)) await appendEvent(tx, scope, "agent.handoff_created", summary);
  return { id: row.id, created: true };
}
