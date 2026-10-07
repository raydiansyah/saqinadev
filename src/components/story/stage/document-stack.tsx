"use client";

import { useState } from "react";
import type { SiteContent } from "@/content/site";
import { cn } from "@/lib/utils";
import { fromStep, PlannedTag, StageFrame } from "./stage-frame";

/** Chapter 05: project artifacts as a stack of real Markdown files. */
interface DocumentStackProps {
  content: SiteContent["stage"]["documents"];
  planned: string;
}

export function DocumentStack({ content, planned }: DocumentStackProps) {
  const [active, setActive] = useState(0);
  const doc = content.docs[active];
  return (
    <StageFrame label={content.file} status={<PlannedTag label={planned} />}>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div role="tablist" aria-label={content.tablist} className="flex flex-col gap-1">
          {content.docs.map((d, i) => (
            <button
              key={d.name}
              type="button"
              role="tab"
              id={`doc-tab-${i}`}
              aria-selected={i === active}
              aria-controls="doc-panel"
              onClick={() => setActive(i)}
              // Files enter one after another, like a stack being laid out.
              style={{ transitionDelay: `${i * 60}ms` }}
              className={cn(
                "min-h-11 rounded-sm border px-3 text-left font-mono text-[0.8125rem] transition-[opacity,transform,border-color] duration-500",
                "group-data-[step=0]/chapter:-translate-x-2 group-data-[step=0]/chapter:opacity-40",
                i === active
                  ? "border-primary/60 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {d.name}
            </button>
          ))}
        </div>
        <div
          id="doc-panel"
          role="tabpanel"
          aria-labelledby={`doc-tab-${active}`}
          className={`min-h-64 rounded-md border border-border bg-background p-4 font-mono text-[0.8125rem] leading-relaxed ${fromStep[1]}`}
        >
          {doc.lines.map((line) => (
            <p
              key={line}
              className={line.startsWith("#") ? "text-foreground" : "text-muted-foreground"}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </StageFrame>
  );
}
