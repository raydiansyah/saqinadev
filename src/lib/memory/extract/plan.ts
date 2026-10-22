import * as z from "zod";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/domain/memory";

/** Pure planning for chat extraction: which messages to read, what counts as grounded. */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export const MAX_WINDOW = 30;
export const MAX_CANDIDATES = 8;
/** Candidates a person has not reviewed yet; extraction pauses beyond this, so it cannot flood. */
export const MAX_PENDING_PER_OWNER = 50;

export const candidateSchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(2).max(1000),
  /** "explicit": the user said it outright. "inferred": the model concluded it. */
  basis: z.enum(["explicit", "inferred"]),
  sourceMessageIds: z.array(z.string()).min(1).max(10),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const extractionSchema = z.object({ candidates: z.array(candidateSchema).max(20) });

/** The messages after the last one already read, oldest first, capped. */
export function selectWindow(
  all: readonly ChatMessage[],
  afterMessageId: string | null,
  max = MAX_WINDOW,
): ChatMessage[] {
  const start = afterMessageId ? all.findIndex((m) => m.id === afterMessageId) + 1 : 0;
  return all.slice(Math.max(start, 0)).slice(-max);
}

const EXPLICIT =
  /^\s*(?:tolong\s+)?(?:(ingat|catat|simpan)(?:\s+(?:bahwa|ini))?|remember(?:\s+that)?|note\s+that|(keputusan|decision)|(batasan|constraint))\s*[:\-–]?\s*([\s\S]{6,})$/i;

/**
 * Things the user asked to be remembered in so many words ("ingat bahwa…", "decision: …").
 * Needs no model, so it still works when none is configured, and it never invents anything.
 */
export function explicitCandidates(messages: readonly ChatMessage[]): Candidate[] {
  const out: Candidate[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    const match = EXPLICIT.exec(m.content.trim());
    if (!match) continue;
    const kind: MemoryKind = match[2] ? "decision" : match[3] ? "constraint" : "fact";
    const content = match[4].trim().slice(0, 1000);
    out.push({
      kind,
      title: content.replace(/\s+/g, " ").slice(0, 80).trim() || "Memory",
      content,
      basis: "explicit",
      sourceMessageIds: [m.id],
    });
  }
  return out;
}

const tokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 4),
  );

/** Share of the claim's words that also appear in the messages it cites. */
export function support(content: string, cited: readonly string[]): number {
  const claim = tokens(content);
  if (claim.size === 0) return 0;
  const evidence = tokens(cited.join(" "));
  let hit = 0;
  for (const t of claim) if (evidence.has(t)) hit++;
  return hit / claim.size;
}

const MIN_SUPPORT = 0.5;
/** A title is a short paraphrase, so it needs less, but it may not be invented from nothing. */
const MIN_TITLE_SUPPORT = 0.3;

/**
 * Keeps only what the model can actually point to: every cited id must be in the window, and
 * the text must share enough words with what it cites. Anything else is dropped, not repaired.
 */
export function groundCandidates(
  raw: readonly Candidate[],
  window: readonly ChatMessage[],
): Candidate[] {
  const byId = new Map(window.map((m) => [m.id, m]));
  const kept: Candidate[] = [];
  for (const c of raw) {
    const cited = c.sourceMessageIds.map((id) => byId.get(id));
    if (cited.some((m) => !m)) continue;
    const texts = (cited as ChatMessage[]).map((m) => m.content);
    // An explicit claim must come from the user's own words; the model may not attribute it.
    if (c.basis === "explicit" && (cited as ChatMessage[]).some((m) => m.role !== "user")) continue;
    if (support(c.content, texts) < MIN_SUPPORT) continue;
    if (support(c.title, texts) < MIN_TITLE_SUPPORT) continue;
    kept.push(c);
  }
  return kept.slice(0, MAX_CANDIDATES);
}

/** Word-set overlap, 0 to 1. Used to notice a new candidate that is close to an existing memory. */
export function jaccard(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

/** At or above this a different text on the same kind is shown to the reviewer as a conflict. */
export const CONFLICT_OVERLAP = 0.5;
