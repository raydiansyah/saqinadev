import { describe, expect, it } from "vitest";
import { MEMORY_CATEGORIES } from "@/lib/domain/enums";
import { type GraphMemory, layoutMemoryGraph, MAX_GRAPH_MEMORIES } from "@/lib/memory/graph-layout";

const mem = (
  i: number,
  category = MEMORY_CATEGORIES[i % MEMORY_CATEGORIES.length],
): GraphMemory => ({
  id: `m${i}`,
  category,
  importance: i % 5 === 0 ? "high" : "normal",
});
const many = (n: number) => Array.from({ length: n }, (_, i) => mem(i));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("layoutMemoryGraph", () => {
  it("draws just the hub for an empty project", () => {
    const g = layoutMemoryGraph([]);
    expect(g.nodes.map((n) => n.kind)).toEqual(["hub"]);
    expect(g.edges).toEqual([]);
  });

  it("makes one category node per used category and one memory node per memory", () => {
    const g = layoutMemoryGraph([mem(0, "product"), mem(1, "product"), mem(2, "design")]);
    expect(g.nodes.filter((n) => n.kind === "category")).toHaveLength(2);
    expect(g.nodes.filter((n) => n.kind === "memory")).toHaveLength(3);
    // hub → each category, and each memory → its category
    expect(g.edges.filter((e) => e.kind === "hub")).toHaveLength(2);
    expect(g.edges.filter((e) => e.kind === "category")).toHaveLength(3);
    for (const e of g.edges) {
      expect(g.nodes.some((n) => n.id === e.from)).toBe(true);
      expect(g.nodes.some((n) => n.id === e.to)).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(layoutMemoryGraph(many(40))).toEqual(layoutMemoryGraph(many(40)));
  });

  it("keeps every node inside the canvas and apart from the others", () => {
    for (const count of [1, 7, 33, 120]) {
      const g = layoutMemoryGraph(many(count));
      for (const n of g.nodes) {
        expect(n.x - n.r).toBeGreaterThanOrEqual(0);
        expect(n.y - n.r).toBeGreaterThanOrEqual(0);
        expect(n.x + n.r).toBeLessThanOrEqual(g.width);
        expect(n.y + n.r).toBeLessThanOrEqual(g.height);
      }
      const memories = g.nodes.filter((n) => n.kind === "memory");
      for (let i = 0; i < memories.length; i++)
        for (let j = i + 1; j < memories.length; j++)
          expect(dist(memories[i], memories[j]), `${count}: ${i}/${j}`).toBeGreaterThan(
            memories[i].r + memories[j].r,
          );
    }
  });

  it("puts a crowded single category in several rows rather than on top of itself", () => {
    const g = layoutMemoryGraph(Array.from({ length: 40 }, (_, i) => mem(i, "technical")));
    const radii = new Set(
      g.nodes
        .filter((n) => n.kind === "memory")
        .map((n) => Math.round(dist(n, { x: g.width / 2, y: g.height / 2 }))),
    );
    expect(radii.size).toBeGreaterThan(1);
  });

  it("caps the picture and reports how many were left out", () => {
    const g = layoutMemoryGraph(many(MAX_GRAPH_MEMORIES + 15));
    expect(g.nodes.filter((n) => n.kind === "memory")).toHaveLength(MAX_GRAPH_MEMORIES);
    expect(g.hidden).toBe(15);
  });

  it("numbers memories in order of appearance for the entrance animation", () => {
    const orders = layoutMemoryGraph(many(12))
      .nodes.filter((n) => n.kind === "memory")
      .map((n) => n.order)
      .sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
});
