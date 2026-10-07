import type { SiteContent } from "@/content/site";
import { fromStep } from "./stage-frame";

const AGENT = ["Claude", "Codex", "Cursor", "Kiro", "Hermes", "OpenClaw"];

function Path({ label, title, items }: { label: string; title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="font-mono text-xs text-subtle-foreground">{label}</p>
      <p className="mt-1 font-medium">{title}</p>
      <ol className="mt-3 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs"
          >
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Chapter 03, the core metaphor: the project splits into two build paths that merge back
 * into shared context. Desktop forks sideways; mobile reads top to bottom.
 */
export function PathSplit({ content }: { content: SiteContent["stage"]["paths"] }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mx-auto w-fit rounded-md border border-border-strong bg-surface px-5 py-3 text-center font-medium">
        {content.project}
      </div>
      {/* Connectors draw with chapter progress. Hidden on mobile, where the flow is vertical. */}
      <svg
        viewBox="0 0 400 48"
        aria-hidden="true"
        className="hidden h-12 w-full sm:block"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M200 0 V24 H100 V48 M200 24 H300 V48"
          pathLength={1}
          className="connect stroke-border-strong"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div aria-hidden="true" className="mx-auto h-6 w-px bg-border-strong sm:hidden" />
      <div className={`grid gap-3 sm:grid-cols-2 ${fromStep[1]}`}>
        <Path label={content.pathA} title={content.here} items={content.hereItems} />
        <div aria-hidden="true" className="mx-auto h-6 w-px bg-border-strong sm:hidden" />
        <Path label={content.pathB} title={content.agent} items={AGENT} />
      </div>
      <div className={fromStep[2]}>
        <svg
          viewBox="0 0 400 48"
          aria-hidden="true"
          className="hidden h-12 w-full sm:block"
          fill="none"
          preserveAspectRatio="none"
        >
          <path
            d="M100 0 V24 H300 V0 M200 24 V48"
            className="stroke-primary/60"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div aria-hidden="true" className="mx-auto h-6 w-px bg-border-strong sm:hidden" />
        <div className="mx-auto w-fit rounded-md border border-primary/60 bg-surface px-5 py-3 text-center">
          <p className="font-medium">{content.shared}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            PRD · PLAN · TASKS · MEMORY
          </p>
        </div>
      </div>
    </div>
  );
}
