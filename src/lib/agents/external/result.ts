import * as z from "zod";

/** What an external agent reports back, normalised. Free text becomes a summary only. */
export const agentResult = z.object({
  status: z.enum(["completed", "failed", "partial"]).default("completed"),
  summary: z.string().trim().max(5000).default(""),
  changes: z.array(z.string().trim().max(500)).max(50).default([]),
  artifacts: z
    .array(z.object({ title: z.string().max(200), content: z.string().max(20_000).default("") }))
    .max(20)
    .default([]),
  issues: z.array(z.string().trim().max(500)).max(50).default([]),
  suggestions: z.array(z.string().trim().max(300)).max(20).default([]),
});
export type AgentResult = z.infer<typeof agentResult>;

/**
 * Accepts the JSON format Saqina asks for, or plain text (then the whole text is the
 * summary). Never invents changes that the agent did not report.
 */
export function parseAgentResult(raw: string): AgentResult {
  const text = raw.trim().slice(0, 50_000);
  const json = text.match(/\{[\s\S]*\}$/)?.[0];
  if (json) {
    try {
      const parsed = agentResult.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
    } catch {
      // Not JSON after all: fall through to plain text.
    }
  }
  return agentResult.parse({ summary: text.slice(0, 5000) });
}
