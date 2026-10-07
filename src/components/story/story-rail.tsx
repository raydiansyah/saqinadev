import type { SiteContent } from "@/content/site";
import { type NodeForm, RAIL_STOPS, STORY } from "@/content/story";

interface StoryRailProps {
  initialNode: NodeForm;
  content: SiteContent["story"];
}

/**
 * System map rail beside the pinned stage. Each stop jumps to the first chapter that uses it;
 * the controller marks done / active / next. Only rendered in the pinned layout.
 */
export function StoryRail({ initialNode, content }: StoryRailProps) {
  return (
    <nav aria-label={content.railLabel} className="hidden [grid-area:rail] pinned:block">
      {/* Persistent project node: one object that changes form as the story moves.
          Translated labels ride along as data so the controller can swap them. */}
      <p
        aria-hidden="true"
        className="mb-6 flex w-fit items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5"
      >
        <span className="size-1.5 rounded-full bg-primary" />
        <span
          data-node-label
          data-labels={JSON.stringify(content.nodes)}
          className="font-mono text-xs text-foreground"
        >
          {content.nodes[initialNode]}
        </span>
      </p>
      <ol className="relative space-y-1 border-l border-border">
        {RAIL_STOPS.map((stop, i) => {
          const target = STORY.find((c) => c.rail === stop || c.railSteps?.includes(stop));
          return (
            <li key={stop}>
              <button
                type="button"
                data-rail-stop={stop}
                data-rail-target={target?.id}
                data-state={i === 0 ? "active" : "next"}
                disabled={!target}
                className="group/stop relative flex min-h-9 w-full items-center gap-3 pl-4 text-left font-mono text-xs text-subtle-foreground transition-colors data-[state=active]:text-foreground data-[state=done]:text-primary enabled:cursor-pointer enabled:hover:text-foreground disabled:cursor-default"
              >
                <span
                  aria-hidden="true"
                  className="absolute -left-[4.5px] size-2 rounded-full border border-border-strong bg-background transition-colors group-data-[state=active]/stop:border-primary group-data-[state=active]/stop:bg-primary group-data-[state=done]/stop:border-primary"
                />
                {content.rail[stop]}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
