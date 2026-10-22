import { describe, expect, it } from "vitest";
import { applyBudget, DEFAULT_BUDGET, resolveBudget } from "@/lib/memory/retrieval/budget";
import { exactTokens, rankCandidates, rrf } from "@/lib/memory/retrieval/rank";

describe("rank fusion", () => {
  it("rewards ids that several lists agree on", () => {
    const scores = rrf([["a", "b", "c"], ["b", "a"], ["b"]]);
    expect([...scores.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("treats an empty list (semantic off) as no contribution", () => {
    expect(rrf([["a"], []]).get("a")).toBe(rrf([["a"]]).get("a"));
  });

  it("prefers confirmed over inferred and core over facts, and shows identical text once", () => {
    const fused = new Map([
      ["x", 0.02],
      ["y", 0.02],
      ["z", 0.02],
      ["dup", 0.019],
    ]);
    const ranked = rankCandidates(
      [
        { id: "x", contentHash: "1", confidence: "inferred" as const, level: "L1" as const },
        { id: "y", contentHash: "2", confidence: "confirmed" as const, level: "L1" as const },
        { id: "z", contentHash: "3", confidence: "confirmed" as const, level: "L3" as const },
        { id: "dup", contentHash: "2", confidence: "confirmed" as const, level: "L1" as const },
      ],
      fused,
    );
    expect(ranked.map((r) => r.id)).toEqual(["z", "y", "x"]);
  });

  it("recognises identifiers and quoted phrases for exact matching", () => {
    expect(exactTokens('where is INV-2024-0042 and "payment webhook" used')).toEqual([
      "payment webhook",
      "INV-2024-0042",
    ]);
    expect(exactTokens("what do we know about login")).toEqual([]);
  });
});

describe("context budget", () => {
  const item = (n: number, len: number) => ({ id: n, content: "x".repeat(len) });

  it("caps the number of items and shortens each one, keeping the rest of the item intact", () => {
    const out = applyBudget([item(1, 5000), item(2, 100), item(3, 100)], {
      ...DEFAULT_BUDGET,
      maxAssets: 2,
      perAssetChars: 300,
    });
    expect(out.map((o) => o.id)).toEqual([1, 2]);
    expect(out[0].truncated).toBe(true);
    expect(out[0].content.length).toBe(300);
    expect(out[1].truncated).toBe(false);
  });

  it("stops when the total is used up", () => {
    const out = applyBudget([item(1, 500), item(2, 500), item(3, 500)], {
      ...DEFAULT_BUDGET,
      maxChars: 700,
      perAssetChars: 500,
    });
    expect(out.map((o) => o.id)).toEqual([1, 2]);
    expect(out.reduce((n, o) => n + o.content.length, 0)).toBeLessThanOrEqual(700);
  });

  it("never lets a caller exceed the ceiling or pass nonsense", () => {
    expect(resolveBudget({ maxAssets: 9999, maxChars: -5 })).toMatchObject({
      maxAssets: 30,
      maxChars: DEFAULT_BUDGET.maxChars,
    });
  });
});
