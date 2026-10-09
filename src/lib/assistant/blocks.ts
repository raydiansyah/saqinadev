import * as z from "zod";
import { pendingIntent } from "./intents/types";

/**
 * Structured pieces of an assistant reply. The UI renders cards from these instead of parsing
 * prose, so important information (what changed, what needs approval) is never only in text.
 */

export const FACT_LABELS = ["confirmed", "inferred", "recommended", "unknown"] as const;
export type FactLabel = (typeof FACT_LABELS)[number];

/** Where a statement came from, shown next to it. */
export const FACT_SOURCES = [
  "prd",
  "requirements",
  "tasks",
  "memory",
  "decision",
  "recommendation",
  "repository",
  "git_branch",
  "project",
  "billing",
  "scope",
  "maintenance",
] as const;

export const finding = z.object({
  label: z.enum(FACT_LABELS),
  source: z.enum(FACT_SOURCES).optional(),
  text: z.string().max(500),
  href: z.string().max(200).optional(),
});
export type Finding = z.infer<typeof finding>;

export const executedItem = z.object({
  kind: z.enum([
    "task",
    "requirement",
    "memory",
    "decision",
    "document",
    "scope",
    "schedule",
    "invoice",
    "change_request",
  ]),
  title: z.string().max(200),
  href: z.string().max(200),
  change: z.enum(["created", "updated", "deleted"]),
});
export type ExecutedItem = z.infer<typeof executedItem>;

export const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(20_000) }),
  z.object({
    type: z.literal("analysis"),
    title: z.string().max(120),
    findings: z.array(finding).max(30),
    recommendation: z.string().max(500).optional(),
  }),
  z.object({ type: z.literal("action"), items: z.array(executedItem).max(30) }),
  z.object({ type: z.literal("proposal"), proposalId: z.uuid() }),
  z.object({ type: z.literal("agent_run"), runId: z.uuid() }),
  z.object({
    type: z.literal("question"),
    question: z.string().max(300),
    options: z.array(z.string().max(120)).max(6),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string().max(40),
    ref: z.string().max(20).optional(),
  }),
]);
export type Block = z.infer<typeof block>;

/** What is stored in `messages.metadata` for an assistant message. */
export const assistantMetadata = z.object({
  blocks: z.array(block).max(20).default([]),
  intent: z.string().max(40).optional(),
  confidence: z.number().optional(),
  provider: z.string().max(120).optional(),
  /** Which model answered and why; shown with the reply so fallbacks are never silent. */
  model: z
    .object({
      label: z.string().max(160),
      source: z.string().max(40),
      fallbackUsed: z.boolean(),
      requested: z.string().max(160).nullable(),
    })
    .optional(),
  pending: pendingIntent.optional(),
  context: z
    .object({
      type: z.string().max(20),
      id: z.string().max(64).nullable(),
      title: z.string().max(200),
    })
    .optional(),
});
export type AssistantMetadata = z.infer<typeof assistantMetadata>;

/** Events streamed to the browser while a reply is being produced (NDJSON, one per line). */
export type StreamEvent =
  | { type: "started"; conversationId: string; userMessageId: string; messageId: string }
  | { type: "status"; stage: "analyzing" | "context" | "preparing" | "writing" }
  | { type: "delta"; text: string }
  | { type: "block"; block: Block }
  | { type: "done"; messageId: string; mutated: boolean }
  | { type: "error"; code: string; ref?: string };
