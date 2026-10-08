import "server-only";
import { eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { toolExecutions } from "@/lib/db/schema";
import type { AgentPermission } from "@/lib/domain/enums";
import { AppError, isAppError } from "@/lib/errors";
import { EventBatch } from "@/lib/events/emitter";
import { GitError } from "@/lib/git/types";
import { log } from "@/lib/log";
import { McpError } from "@/lib/mcp/client";
import { createProposalTx } from "@/lib/proposals/repository";
import { allow } from "@/lib/rate-limit";
import { scrubValue } from "@/lib/secrets/scan";
import { HANDLERS } from "./handlers";
import { type Schema, validateJson } from "./json-schema";
import { decideTool } from "./policy";
import { findTool } from "./registry";

export type ToolActor =
  | { kind: "member" }
  | { kind: "agent"; agentId: string; name: string; permissions: AgentPermission[] };

export interface ToolRequest {
  access: ProjectAccess;
  /** Tool key (`source:connection:name`) or bare name. */
  tool: string;
  input: Record<string, unknown>;
  actor: ToolActor;
  /** Same key → same execution. Double clicks and retries never run a tool twice. */
  idempotencyKey: string;
  runId?: string | null;
  conversationId?: string | null;
  /** Set when a person already approved this exact call. */
  approvedProposalId?: string | null;
}

export type ToolResult =
  | { status: "succeeded"; output: Record<string, unknown>; executionId: string }
  | { status: "pending_approval"; proposalId: string; executionId: string };

const MAX_OUTPUT = 32_000;

/** Scrubs secrets and caps size before anything is stored or handed to a model. */
export function sanitizeOutput(value: unknown): Record<string, unknown> {
  const clean = scrubValue(value) as Record<string, unknown>;
  const json = JSON.stringify(clean ?? {});
  if (json.length <= MAX_OUTPUT) return clean ?? {};
  return { truncated: true, preview: json.slice(0, MAX_OUTPUT) };
}

const errorCode = (error: unknown) =>
  error instanceof GitError || error instanceof McpError
    ? error.code
    : isAppError(error)
      ? error.code
      : "internal";

/**
 * The only way a tool runs. Order is fixed: identify → project access → agent permission →
 * risk policy → input validation → approval if required → execute → sanitize → audit.
 */
export async function executeTool(request: ToolRequest): Promise<ToolResult> {
  const { access, actor } = request;
  const [previous] = await db
    .select()
    .from(toolExecutions)
    .where(eq(toolExecutions.idempotencyKey, request.idempotencyKey));
  if (previous) {
    if (previous.projectId !== access.project.id) throw new AppError("CONFLICT", "Key reused");
    if (previous.status === "succeeded")
      return { status: "succeeded", output: previous.output ?? {}, executionId: previous.id };
    if (
      previous.status === "pending_approval" &&
      previous.proposalId &&
      !request.approvedProposalId
    )
      return {
        status: "pending_approval",
        proposalId: previous.proposalId,
        executionId: previous.id,
      };
    if (previous.status !== "pending_approval")
      throw new AppError("CONFLICT", `Already ${previous.status}`);
  }

  const tool = await findTool(access.project.id, request.tool);
  if (!tool) throw new AppError("NOT_FOUND", "Unknown tool");
  const audit = {
    projectId: access.project.id,
    toolId: tool.id,
    toolName: tool.name,
    source: tool.source,
    runId: request.runId ?? null,
    agentId: actor.kind === "agent" ? actor.agentId : null,
    actorId: access.actor.id,
    riskLevel: tool.riskLevel,
    input: scrubValue(request.input) as Record<string, unknown>,
    idempotencyKey: request.idempotencyKey,
  };
  const write = async (
    values: Partial<typeof toolExecutions.$inferInsert> & {
      status: (typeof toolExecutions.$inferInsert)["status"];
    },
  ) => {
    const [row] = await db
      .insert(toolExecutions)
      .values({ ...audit, ...values })
      .onConflictDoUpdate({ target: toolExecutions.idempotencyKey, set: values })
      .returning({ id: toolExecutions.id });
    return row.id;
  };

  const decision = decideTool({
    risk: tool.riskLevel,
    trust: tool.trust,
    role: access.role,
    agent: actor.kind === "agent" ? { permissions: actor.permissions } : null,
    toolPermission: tool.agentPermission,
    approved: Boolean(request.approvedProposalId),
  });
  if (decision.kind === "deny") {
    await write({ status: "denied", errorCode: decision.reason });
    throw new AppError("AUTHORIZATION_ERROR", `Tool denied: ${decision.reason}`, {
      tool: decision.reason,
    });
  }

  const errors = validateJson(tool.inputSchema as Schema, request.input);
  if (errors.length) {
    await write({ status: "failed", errorCode: "invalid_input" });
    throw new AppError("VALIDATION_ERROR", "Invalid tool input", { input: errors[0].path });
  }

  if (decision.kind === "approval") {
    const batch = new EventBatch();
    const proposalId = await db.transaction(async (tx) => {
      const proposal = await createProposalTx(
        tx,
        access,
        {
          type: actor.kind === "agent" ? "agent_result" : "assistant",
          title: `${tool.name}${actor.kind === "agent" ? ` (${actor.name})` : ""}`,
          description: tool.description,
          actions: [
            {
              type: "RUN_TOOL",
              key: "x1",
              payload: {
                tool: tool.key,
                input: request.input,
                idempotencyKey: request.idempotencyKey,
              },
              display: { name: tool.name, source: tool.source, risk: tool.riskLevel },
            },
          ],
          conversationId: request.conversationId ?? null,
          runId: request.runId ?? null,
        },
        batch,
      );
      return proposal.id;
    });
    batch.flush();
    const executionId = await write({ status: "pending_approval", proposalId });
    return { status: "pending_approval", proposalId, executionId };
  }

  const limit = tool.source === "git" && tool.riskLevel !== "low" ? 20 : 120;
  if (!allow(`tool:${tool.source}:${access.project.id}`, limit, 60_000))
    throw new AppError("RATE_LIMIT");

  const started = performance.now();
  const batch = new EventBatch();
  try {
    const raw = await HANDLERS[tool.source](tool, request.input, { access, batch });
    const output = sanitizeOutput(raw);
    const executionId = await write({
      status: "succeeded",
      output,
      proposalId: request.approvedProposalId ?? null,
      durationMs: Math.round(performance.now() - started),
      errorCode: null,
    });
    await batch.emit(db, {
      type: tool.source === "mcp" ? "MCP_TOOL_EXECUTED" : "TOOL_EXECUTED",
      projectId: access.project.id,
      actorId: access.actor.id,
      entityType: "tool",
      entityId: tool.id,
      data: {
        title: tool.name,
        source: tool.source,
        ...(actor.kind === "agent" ? { agent: actor.name, via: "agent" } : {}),
      },
    });
    batch.flush();
    return { status: "succeeded", output, executionId };
  } catch (error) {
    const code = errorCode(error);
    log.warn("tool.failed", { tool: tool.name, source: tool.source, code });
    await write({
      status: "failed",
      errorCode: code,
      durationMs: Math.round(performance.now() - started),
    });
    if (isAppError(error)) throw error;
    throw new AppError("VALIDATION_ERROR", "Tool execution failed", { tool: code });
  }
}
