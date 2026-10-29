import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { runAi } from "@/lib/ai/gateway";
import type { AiProvider, PromptSegment } from "@/lib/ai/provider";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { mcpConnections, tools } from "@/lib/db/schema";
import { isAppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { executeTool } from "@/lib/tools/executor";
import { ensureProjectTools } from "@/lib/tools/registry";
import type { Block } from "./blocks";

/**
 * A chat turn that uses a connector: the person picked connectors in the composer, or named one in
 * the message. A model (or, without one, the rules) picks the tool and its input; the tool then
 * runs through the same executor as everywhere else, so policy, audit, rate limits and approval all
 * apply: a low or medium risk tool runs, a high risk one becomes a proposal.
 */

export interface ToolChoice {
  connectorId: string;
  key: string;
  name: string;
  connector: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Enabled tools of connectors this project may use, limited to the ones picked (if any). */
export async function availableTools(
  access: ProjectAccess,
  connectorIds: string[],
): Promise<ToolChoice[]> {
  await ensureProjectTools(db, access.project.id);
  const rows = await db
    .select({
      key: tools.key,
      name: tools.name,
      description: tools.description,
      inputSchema: tools.inputSchema,
      connector: mcpConnections.name,
      connectorId: mcpConnections.id,
    })
    .from(tools)
    .innerJoin(mcpConnections, eq(mcpConnections.id, tools.connectionId))
    .where(
      and(
        eq(tools.projectId, access.project.id),
        eq(tools.source, "mcp"),
        eq(tools.trust, "enabled"),
        eq(mcpConnections.status, "connected"),
        eq(mcpConnections.enabled, true),
        ...(connectorIds.length ? [inArray(mcpConnections.id, connectorIds)] : []),
      ),
    )
    .orderBy(tools.key)
    .limit(60);
  return rows;
}

/** Without picked connectors, a turn uses tools only when the message names a connector or tool. */
export function mentionedTools(message: string, choices: ToolChoice[]): ToolChoice[] {
  const text = message.toLowerCase();
  const named = (s: string) => s.length >= 3 && hasWord(text, s.toLowerCase());
  return choices.filter((c) => named(c.name) || named(c.connector));
}

const WORD = /\w/;

/** Whether `word` appears in `text` with a word boundary on both sides (no regex from input). */
function hasWord(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    const before = text[at - 1];
    const after = text[at + word.length];
    if ((!before || !WORD.test(before)) && (!after || !WORD.test(after))) return true;
  }
  return false;
}

/**
 * The rules' guess, used when no model is set up: a tool named in the message (or the only one),
 * with the message as its first required text input.
 */
export function ruleChoice(
  message: string,
  choices: ToolChoice[],
): { tool: ToolChoice; input: Record<string, unknown> } | null {
  const named = mentionedTools(message, choices).filter((c) =>
    message.toLowerCase().includes(c.name.toLowerCase()),
  );
  const tool = named[0] ?? (choices.length === 1 ? choices[0] : null);
  if (!tool) return null;
  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: string }>;
    required?: string[];
  };
  const props = schema.properties ?? {};
  const field =
    (schema.required ?? []).find((k) => props[k]?.type === "string") ??
    Object.keys(props).find((k) => props[k]?.type === "string");
  return { tool, input: field ? { [field]: message } : {} };
}

const choiceSchema = z.object({
  tool: z.string().max(200).nullable(),
  input: z.record(z.string(), z.unknown()).default({}),
});

export interface ToolTurn {
  /** What the reply says, before a model phrases it. */
  draft: string;
  blocks: Block[];
  /** The result for the answer prompt. */
  segments: PromptSegment[];
  mutated: boolean;
}

const excerpt = (output: unknown) => {
  const o = output as { text?: unknown };
  const text = typeof o?.text === "string" ? o.text : JSON.stringify(output, null, 2);
  return text.slice(0, 4000);
};

export async function runToolTurn(
  access: ProjectAccess,
  input: { message: string; choices: ToolChoice[]; conversationId: string; messageId: string },
  copy: {
    ran: (tool: string) => string;
    pending: (tool: string) => string;
    failed: (tool: string) => string;
    none: string;
  },
  options: { provider?: AiProvider; signal?: AbortSignal } = {},
): Promise<ToolTurn | null> {
  const { choices } = input;
  if (choices.length === 0) return null;
  const picked = await runAi({
    access,
    operation: "tool_call",
    required: ["structured_output"],
    override: options.provider,
    run: async (client) => {
      if (client.deterministic) return ruleChoice(input.message, choices);
      const raw = await client.generateObject(
        {
          system:
            "Pick the one tool that answers the person's message and fill its input from the message, following the tool's JSON schema. Return tool null when no tool fits.",
          segments: [
            {
              kind: "external",
              label: "tools",
              content: JSON.stringify(
                choices.map((c) => ({
                  tool: c.key,
                  description: c.description.slice(0, 300),
                  inputSchema: c.inputSchema,
                })),
              ).slice(0, 20_000),
            },
          ],
          userMessage: input.message,
          draft: "",
          maxOutputTokens: 600,
          signal: options.signal,
        },
        choiceSchema,
        "tool_choice",
      );
      const tool = choices.find((c) => c.key === raw.tool);
      return tool ? { tool, input: raw.input } : null;
    },
  });
  const choice = picked.value;
  if (!choice) return { draft: copy.none, blocks: [], segments: [], mutated: false };

  const { tool } = choice;
  try {
    const result = await executeTool({
      access,
      tool: tool.key,
      input: choice.input,
      actor: { kind: "member" },
      conversationId: input.conversationId,
      idempotencyKey: `chat:${input.messageId}:${tool.key}`,
    });
    if (result.status === "pending_approval")
      return {
        draft: copy.pending(tool.name),
        blocks: [{ type: "proposal", proposalId: result.proposalId }],
        segments: [],
        mutated: true,
      };
    const text = excerpt(result.output);
    return {
      draft: copy.ran(tool.name),
      blocks: [
        {
          type: "tool_result",
          tool: tool.name,
          connector: tool.connector,
          status: "succeeded",
          excerpt: text,
        },
      ],
      segments: [{ kind: "tool_output", label: `${tool.connector}: ${tool.name}`, content: text }],
      mutated: false,
    };
  } catch (error) {
    log.warn("assistant.tool_failed", { code: isAppError(error) ? error.code : "error" });
    return {
      draft: copy.failed(tool.name),
      blocks: [
        {
          type: "tool_result",
          tool: tool.name,
          connector: tool.connector,
          status: "failed",
          excerpt: "",
        },
      ],
      segments: [],
      mutated: false,
    };
  }
}
