import type { CSSProperties, ReactNode } from "react";
import { Section } from "@/components/primitives/section";
import type { SiteContent } from "@/content/site";
import { PromptCycle } from "./prompt-cycle";

type Content = SiteContent["pillars"];

/** A ring of project parts turning around the project: everything hangs off one record. */
function Orbit({ items }: { items: string[] }) {
  return (
    <div aria-hidden="true" className="scene grid h-44 place-items-center">
      <div className="relative grid size-10 place-items-center rounded-full border border-primary/60 bg-primary/15 font-mono text-xs text-primary">
        P
        <div className="orbit absolute inset-0">
          {items.map((item, i) => (
            <span
              key={item}
              className="orbit-item absolute top-1/2 left-1/2 -mt-3 -ml-8 w-16 rounded-sm border border-border-strong bg-surface py-1 text-center font-mono text-[0.625rem] text-foreground"
              style={{ "--a": `${(360 / items.length) * i}deg`, "--r": "104px" } as CSSProperties}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PortalPreview({ portal }: { portal: Content["portal"] }) {
  return (
    <div aria-hidden="true" className="flex h-44 flex-col justify-center gap-3 px-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{portal.label}</span>
        <span className="font-mono">80%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div className="fill-bar h-full bg-primary" style={{ "--w": "80%" } as CSSProperties} />
      </div>
      <div className="flex items-baseline justify-between rounded-md border border-border bg-background px-3 py-2">
        <span className="font-semibold tabular-nums">{portal.value}</span>
        <span className="font-mono text-[0.6875rem] text-warning">{portal.due}</span>
      </div>
    </div>
  );
}

export function Pillars({ content }: { content: Content }) {
  const visuals: Record<Content["items"][number]["id"], ReactNode> = {
    project: <Orbit items={content.orbit} />,
    portal: <PortalPreview portal={content.portal} />,
    ai: (
      <div className="flex h-44 items-center px-2">
        <PromptCycle prompts={content.prompts} />
      </div>
    ),
  };
  return (
    <Section id="product" file={content.file} title={content.title}>
      <ul className="grid gap-4 md:grid-cols-3">
        {content.items.map((item, i) => (
          <li
            key={item.id}
            data-reveal
            style={{ "--reveal-delay": `${i * 120}ms` } as CSSProperties}
            className="group rounded-lg border border-border bg-surface p-5 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-primary/50"
          >
            <div className="overflow-hidden rounded-md border border-border bg-background">
              {visuals[item.id]}
            </div>
            <h3 className="mt-5 text-lg font-semibold">{item.name}</h3>
            <ul className="mt-3 space-y-2">
              {item.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="mt-0.5 font-mono text-primary">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}
