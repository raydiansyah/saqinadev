import type { MemoryConfidence, MemoryLevel } from "@/lib/domain/memory";

/** Standard Reciprocal Rank Fusion constant. Larger k flattens the difference between ranks. */
export const RRF_K = 60;

/**
 * Fuses several ranked lists of ids into one score per id: sum of 1 / (k + rank). A list that
 * is empty (for example the vector list while semantic search is off) simply adds nothing.
 */
export function rrf(lists: readonly (readonly string[])[], k = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return scores;
}

const CONFIDENCE_WEIGHT: Record<MemoryConfidence, number> = {
  confirmed: 1.15,
  derived: 1,
  extracted: 0.95,
  inferred: 0.85,
};
// Stable, high-level context is worth showing first; a scenario summary sits between.
const LEVEL_WEIGHT: Record<MemoryLevel, number> = { L3: 1.25, L2: 1.1, L1: 1 };

export interface RankInput {
  id: string;
  contentHash: string;
  confidence: MemoryConfidence;
  level: MemoryLevel;
}

/** Quality signals applied on top of the fused score. Pure, so the order can be tested. */
export function rankCandidates<T extends RankInput>(
  items: readonly T[],
  fused: ReadonlyMap<string, number>,
): (T & { score: number })[] {
  const scored = items
    .map((item) => ({
      ...item,
      score:
        (fused.get(item.id) ?? 0) * CONFIDENCE_WEIGHT[item.confidence] * LEVEL_WEIGHT[item.level],
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Identical text under two ids (an import and a manual copy) is shown once, the better one.
  const seen = new Set<string>();
  return scored.filter((item) => {
    if (seen.has(item.contentHash)) return false;
    seen.add(item.contentHash);
    return true;
  });
}

/** Words that look like an identifier: quoted phrases, or tokens with digits, `-`, `_`, `.`, `/`. */
export function exactTokens(query: string): string[] {
  const quoted = [...query.matchAll(/"([^"]{2,80})"/g)].map((m) => m[1].trim());
  const rest = query.replace(/"[^"]*"/g, " ");
  const codeLike = rest
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter((t) => t.length >= 3 && /[\d\-_./]/.test(t));
  return [...new Set([...quoted, ...codeLike])].slice(0, 5);
}
