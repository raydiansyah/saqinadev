export interface Budget {
  maxAssets: number;
  maxChars: number;
  perAssetChars: number;
  timeoutMs: number;
}

export const DEFAULT_BUDGET: Budget = {
  maxAssets: 12,
  maxChars: 8000,
  perAssetChars: 1200,
  timeoutMs: 1500,
};

/** Hard ceilings: a caller may ask for less, never for more than the model context can take. */
const CEILING: Budget = { maxAssets: 30, maxChars: 20000, perAssetChars: 4000, timeoutMs: 5000 };

export function resolveBudget(partial: Partial<Budget> = {}): Budget {
  const pick = (key: keyof Budget) => {
    const value = partial[key];
    return value !== undefined && value > 0 ? Math.min(value, CEILING[key]) : DEFAULT_BUDGET[key];
  };
  return {
    maxAssets: pick("maxAssets"),
    maxChars: pick("maxChars"),
    perAssetChars: pick("perAssetChars"),
    timeoutMs: pick("timeoutMs"),
  };
}

export interface Budgeted {
  content: string;
}

/**
 * Keeps the best items (already ranked) that fit: at most `maxAssets`, each cut to
 * `perAssetChars`, and the total under `maxChars`. Items are only shortened, never dropped for
 * being long, so their citations survive; once the room is gone the rest are left out.
 */
export function applyBudget<T extends Budgeted>(
  items: readonly T[],
  budget: Budget,
): (T & { truncated: boolean })[] {
  const out: (T & { truncated: boolean })[] = [];
  let used = 0;
  for (const item of items) {
    if (out.length >= budget.maxAssets) break;
    const room = Math.min(budget.perAssetChars, budget.maxChars - used);
    // Less than a sentence of room is not worth an item.
    if (room < 80) break;
    const truncated = item.content.length > room;
    const content = truncated ? `${item.content.slice(0, room - 1).trimEnd()}…` : item.content;
    used += content.length;
    out.push({ ...item, content, truncated });
  }
  return out;
}
