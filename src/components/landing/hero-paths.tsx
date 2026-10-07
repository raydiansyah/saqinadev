"use client";

import { type CSSProperties, type KeyboardEvent, useId, useState } from "react";
import type { SiteContent } from "@/content/site";
import { cn } from "@/lib/utils";

type PathKey = "here" | "agent";

/**
 * Hero interaction: two ways to build share one stage. Hover, focus or click a path to see
 * its flow; both always end in the same shared project context.
 */
export function HeroPaths({ content }: { content: SiteContent["heroPaths"] }) {
  const [path, setPath] = useState<PathKey>("here");
  const base = useId();
  const keys: PathKey[] = ["here", "agent"];

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = path === "here" ? "agent" : "here";
    setPath(next);
    document.getElementById(`${base}-${next}`)?.focus();
  };

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label={content.tablist}
        onKeyDown={onKeyDown}
        className="intro grid grid-cols-2 gap-3"
        style={{ "--d": "450ms" } as CSSProperties}
      >
        {keys.map((key) => (
          <button
            key={key}
            id={`${base}-${key}`}
            type="button"
            role="tab"
            aria-selected={path === key}
            aria-controls={`${base}-panel`}
            tabIndex={path === key ? 0 : -1}
            onClick={() => setPath(key)}
            onMouseEnter={() => setPath(key)}
            onFocus={() => setPath(key)}
            className={cn(
              "min-h-14 rounded-md border px-4 text-left transition-colors",
              path === key
                ? "border-primary bg-surface text-foreground"
                : "border-border text-muted-foreground hover:border-border-strong",
            )}
          >
            <span className="block font-mono text-xs text-subtle-foreground">
              {key === "here" ? content.pathA : content.pathB}
            </span>
            <span className="font-medium">{content[key].label}</span>
          </button>
        ))}
      </div>

      {/* Connector: the selected path lights its leg; both legs merge below. */}
      <svg
        viewBox="0 0 400 40"
        aria-hidden="true"
        className="intro h-10 w-full"
        style={{ "--d": "600ms" } as CSSProperties}
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M100 0 V20 H200"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          className={cn(
            "transition-colors",
            path === "here" ? "stroke-primary" : "stroke-border-strong",
          )}
        />
        <path
          d="M300 0 V20 H200"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          className={cn(
            "transition-colors",
            path === "agent" ? "stroke-primary" : "stroke-border-strong",
          )}
        />
        <path
          d="M200 20 V40"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          className="stroke-primary"
        />
      </svg>

      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-${path}`}
        className="intro rounded-lg border border-border bg-surface p-5"
        style={{ "--d": "750ms" } as CSSProperties}
      >
        <ol key={path} className="flex flex-col gap-2">
          {content[path].flow.map((step, i) => (
            <li
              key={step}
              style={{ animationDelay: `${i * 60}ms` }}
              className="flex items-center gap-3 [animation:node-morph_320ms_ease-out_both] motion-reduce:animate-none"
            >
              <span className="w-5 font-mono text-xs text-subtle-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          {content.shared}
          <span className="font-mono text-xs text-muted-foreground">PRD · PLAN · MEMORY</span>
        </p>
      </div>
    </div>
  );
}
