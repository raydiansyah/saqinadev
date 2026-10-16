"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { LocalTime } from "@/components/primitives/local-time";
import type { MemoryCategory, MemorySource } from "@/lib/domain/enums";
import { layoutMemoryGraph } from "@/lib/memory/graph-layout";
import { cn } from "@/lib/utils";

export interface GraphItem {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  importance: "high" | "normal";
  source: MemorySource;
  entityType: string | null;
  createdAt: string;
  /** Written recently enough to still draw the eye. */
  isNew: boolean;
}

/** The entrance plays once per browser session and project, not on every visit to the view. */
const playedKey = (slug: string) => `saqina:memory-graph:${slug}`;

/**
 * The project's memory as a map: the project in the middle, a node per category around it, the
 * memories fanned out beyond. Built with plain SVG (no dependency). Nodes are real buttons for
 * keyboard users; the list view is the full-text alternative. With reduced motion the picture is
 * simply there.
 */
export function MemoryGraph({ slug, items }: { slug: string; items: GraphItem[] }) {
  const t = useTranslations("memory");
  const [selected, setSelected] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(playedKey(slug))) {
        setAnimate(true);
        sessionStorage.setItem(playedKey(slug), "1");
      }
    } catch {
      // Storage blocked: skip the entrance rather than replaying it each time.
    }
  }, [slug]);

  const layout = useMemo(
    () =>
      layoutMemoryGraph(
        items.map((i) => ({ id: i.id, category: i.category, importance: i.importance })),
      ),
    [items],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const nodeAt = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const current = selected ? byId.get(selected) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <figure className="min-w-0 rounded-lg border border-border bg-surface p-2">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="group"
          aria-label={t("graph.label", { count: items.length })}
          className="mx-auto block h-auto max-h-[75vh] w-full"
        >
          <g className="text-border-strong" fill="none" stroke="currentColor" strokeWidth="1.2">
            {layout.edges.map((e) => {
              const a = nodeAt.get(e.from);
              const b = nodeAt.get(e.to);
              if (!a || !b) return null;
              return (
                <line
                  key={`${e.from}>${e.to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  pathLength={1}
                  className={animate ? "graph-edge-enter" : undefined}
                  style={
                    animate
                      ? ({
                          "--graph-delay": `${edgeDelay(nodeAt.get(e.to))}ms`,
                        } as React.CSSProperties)
                      : undefined
                  }
                />
              );
            })}
          </g>
          {layout.nodes.map((n) => {
            const delay =
              n.kind === "memory" ? 250 + n.order * 22 : n.kind === "category" ? 120 : 0;
            const enter = animate ? "graph-enter" : undefined;
            const style = {
              "--graph-delay": `${delay}ms`,
              transformBox: "fill-box",
              transformOrigin: "center",
            } as React.CSSProperties;
            if (n.kind === "hub")
              return (
                <g key={n.id} className={enter} style={style}>
                  <circle cx={n.x} cy={n.y} r={n.r} className="fill-primary" />
                  <text
                    x={n.x}
                    y={n.y + n.r + 16}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium"
                  >
                    {t("graph.hub")}
                  </text>
                </g>
              );
            if (n.kind === "category")
              return (
                <g key={n.id} className={enter} style={style}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    className="fill-surface-raised stroke-border-strong"
                    strokeWidth="1.5"
                  />
                  <text
                    x={n.x}
                    y={n.y + n.r + 14}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {t(`categories.${n.category}`)}
                  </text>
                </g>
              );
            const item = byId.get(n.id);
            const active = selected === n.id;
            return (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={item?.title}
                aria-pressed={active}
                onClick={() => setSelected(active ? null : n.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(active ? null : n.id);
                  }
                }}
                className={cn(
                  "cursor-pointer outline-none focus-visible:[&>circle:last-of-type]:stroke-primary",
                  enter,
                )}
                style={style}
              >
                {item?.isNew ? (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    className="graph-pulse fill-primary/50"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  />
                ) : null}
                {/* A larger invisible target keeps small nodes usable on touch screens. */}
                <circle cx={n.x} cy={n.y} r={Math.max(n.r, 14)} fill="transparent" />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  strokeWidth={active ? 3 : 1.5}
                  className={cn(
                    n.importance === "high" ? "fill-warning" : "fill-primary/70",
                    active ? "stroke-foreground" : "stroke-surface",
                  )}
                />
              </g>
            );
          })}
        </svg>
        {layout.hidden > 0 ? (
          <figcaption className="px-2 pb-1 text-xs text-subtle-foreground">
            {t("graph.hidden", { count: layout.hidden })}
          </figcaption>
        ) : null}
      </figure>

      <aside
        aria-live="polite"
        className="min-w-0 rounded-lg border border-border p-4 text-sm lg:self-start"
      >
        {current ? (
          <article>
            <p className="font-mono text-xs uppercase tracking-wide text-subtle-foreground">
              {t(`categories.${current.category}`)}
            </p>
            <h2 className="mt-1 font-medium text-pretty">{current.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{current.content}</p>
            <p className="mt-3 text-xs text-subtle-foreground">
              {t(`sources.${current.source}`)} · <LocalTime iso={current.createdAt} />
              {current.entityType ? ` · ${t("graph.about", { entity: current.entityType })}` : ""}
            </p>
          </article>
        ) : (
          <p className="text-muted-foreground">{t("graph.pick")}</p>
        )}
      </aside>
    </div>
  );
}

function edgeDelay(node: ReturnType<typeof layoutMemoryGraph>["nodes"][number] | undefined) {
  if (!node) return 0;
  return node.kind === "memory" ? 200 + node.order * 22 : 80;
}
