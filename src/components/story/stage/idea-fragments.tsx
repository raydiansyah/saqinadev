import type { SiteContent } from "@/content/site";
import { fromStep, StageFrame } from "./stage-frame";

// Scatter offsets per fragment; each settles into the grid as the chapter progresses.
const SCATTER = [
  { x: "-6%", y: "-14%", r: "-3deg" },
  { x: "8%", y: "10%", r: "2deg" },
  { x: "-4%", y: "18%", r: "1.5deg" },
  { x: "10%", y: "-8%", r: "-2deg" },
];

/** Chapter 01: one sentence that already contains the pieces of a project. */
export function IdeaFragments({ content }: { content: SiteContent["stage"]["idea"] }) {
  return (
    <StageFrame label={content.file}>
      <blockquote className="text-pretty text-xl leading-snug text-foreground sm:text-2xl">
        {content.sentence.map((part) =>
          part.mark ? (
            <mark key={part.text} className="bg-transparent text-primary">
              {part.text}
            </mark>
          ) : (
            <span key={part.text}>{part.text}</span>
          ),
        )}
      </blockquote>
      <ul className={`mt-8 grid grid-cols-2 gap-3 ${fromStep[1]}`}>
        {content.fragments.map((f, i) => {
          const s = SCATTER[i % SCATTER.length];
          return (
            <li
              key={f.kind}
              style={{
                transform: `translate(calc(${s.x} * (1 - var(--p, 1)) * 4), calc(${s.y} * (1 - var(--p, 1)) * 4)) rotate(calc(${s.r} * (1 - var(--p, 1))))`,
              }}
              className="rounded-md border border-dashed border-border-strong px-3 py-2.5"
            >
              <span className="block font-mono text-xs text-subtle-foreground">{f.kind}</span>
              <span className="mt-0.5 block text-sm">{f.value}</span>
            </li>
          );
        })}
      </ul>
    </StageFrame>
  );
}
