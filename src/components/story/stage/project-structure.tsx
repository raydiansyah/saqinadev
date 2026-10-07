import type { SiteContent } from "@/content/site";
import { fromStep, StageFrame } from "./stage-frame";

/** Chapter 02: the scattered fragments line up into a project structure. */
export function ProjectStructure({ content }: { content: SiteContent["stage"]["project"] }) {
  return (
    <StageFrame
      label={content.file}
      status={<span className="font-mono text-xs text-primary">{content.structured}</span>}
    >
      <p className="text-2xl font-semibold tracking-tight">{content.name}</p>
      <dl className="mt-6 divide-y divide-border border-y border-border">
        {content.rows.map((row, i) => (
          <div
            key={row.key}
            style={{
              transform: `translateX(calc(${(i % 2 ? 1 : -1) * 24}px * (1 - var(--p, 1))))`,
            }}
            className="grid grid-cols-[7rem_1fr] gap-4 py-3 text-sm"
          >
            <dt className="text-muted-foreground">{row.key}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className={`mt-5 flex flex-wrap items-center gap-3 text-sm ${fromStep[2]}`}>
        <span className="text-muted-foreground">{content.complexity}</span>
        <span className="rounded-sm border border-border-strong px-2 py-0.5 font-mono text-xs">
          {content.complexityValue}
        </span>
        <span className="text-muted-foreground">{content.ready}</span>
      </div>
    </StageFrame>
  );
}
