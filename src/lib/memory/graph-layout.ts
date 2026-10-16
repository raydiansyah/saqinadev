import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/domain/enums";

/**
 * Where each node of the memory graph sits. Pure and deterministic: the same memories always
 * give the same picture, so nothing jumps when a page refreshes and the layout can be tested
 * without a browser. Hub in the middle, one node per category on a ring, each category's
 * memories fanned out beyond it in rows of non-overlapping nodes.
 */

export interface GraphMemory {
  id: string;
  category: MemoryCategory;
  importance: "high" | "normal";
}

export type GraphNode =
  | { kind: "hub"; id: "hub"; x: number; y: number; r: number }
  | { kind: "category"; id: string; category: MemoryCategory; x: number; y: number; r: number }
  | {
      kind: "memory";
      id: string;
      category: MemoryCategory;
      importance: "high" | "normal";
      x: number;
      y: number;
      r: number;
      /** Order of appearance, for staggering the entrance animation. */
      order: number;
    };

export interface GraphEdge {
  from: string;
  to: string;
  kind: "hub" | "category";
}

export interface MemoryGraphLayout {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Memories left out because the picture stays readable only up to a point. */
  hidden: number;
}

export const MAX_GRAPH_MEMORIES = 120;
const HUB_R = 26;
const CATEGORY_R = 17;
const MEMORY_R = 8;
const MEMORY_R_HIGH = 11;
const RING_GAP = 58;
/** Centre-to-centre distance two memory nodes never go below. */
const SPACING = 30;

export function layoutMemoryGraph(memories: GraphMemory[]): MemoryGraphLayout {
  const shown = memories.slice(0, MAX_GRAPH_MEMORIES);
  const hidden = memories.length - shown.length;
  const categories = MEMORY_CATEGORIES.filter((c) => shown.some((m) => m.category === c));
  const n = categories.length;

  const firstRing = HUB_R + CATEGORY_R + 70;
  const sector = n > 0 ? (2 * Math.PI) / n : 0;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let order = 0;
  let maxRadius = firstRing;

  // Temporary positions around (0, 0); shifted to the middle of the canvas at the end.
  nodes.push({ kind: "hub", id: "hub", x: 0, y: 0, r: HUB_R });
  categories.forEach((category, i) => {
    const angle = -Math.PI / 2 + i * sector;
    const id = `category:${category}`;
    nodes.push({
      kind: "category",
      id,
      category,
      x: Math.cos(angle) * firstRing,
      y: Math.sin(angle) * firstRing,
      r: CATEGORY_R,
    });
    edges.push({ from: "hub", to: id, kind: "hub" });

    // Fan this category's memories out in rows beyond it, inside its own slice of the circle.
    const mine = shown.filter((m) => m.category === category);
    let placed = 0;
    // What the next row hangs from: the category first, then the nearest node of the row before.
    let anchors: { id: string; x: number; y: number }[] = [
      { id, x: Math.cos(angle) * firstRing, y: Math.sin(angle) * firstRing },
    ];
    for (let row = 1; placed < mine.length; row++) {
      const radius = firstRing + row * RING_GAP;
      const usable = sector * 0.86;
      const capacity = Math.max(1, Math.floor((radius * usable) / SPACING) + 1);
      const inRow = Math.min(capacity, mine.length - placed);
      const thisRow: typeof anchors = [];
      for (let k = 0; k < inRow; k++) {
        const m = mine[placed + k];
        const offset =
          inRow === 1
            ? 0
            : (k / (inRow - 1) - 0.5) * Math.min(usable, ((inRow - 1) * SPACING) / radius);
        const a = angle + offset;
        nodes.push({
          kind: "memory",
          id: m.id,
          category,
          importance: m.importance,
          x: Math.cos(a) * radius,
          y: Math.sin(a) * radius,
          r: m.importance === "high" ? MEMORY_R_HIGH : MEMORY_R,
          order: order++,
        });
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        const parent = anchors.reduce((best, c) =>
          Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best,
        );
        edges.push({ from: parent.id, to: m.id, kind: "category" });
        thisRow.push({ id: m.id, x, y });
      }
      placed += inRow;
      anchors = thisRow;
      maxRadius = Math.max(maxRadius, radius);
    }
  });

  const half = maxRadius + MEMORY_R_HIGH + 28;
  const size = Math.ceil(half * 2);
  for (const node of nodes) {
    node.x = Math.round((node.x + half) * 10) / 10;
    node.y = Math.round((node.y + half) * 10) / 10;
  }
  return { width: size, height: size, nodes, edges, hidden };
}
