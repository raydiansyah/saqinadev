import type { SiteContent } from "@/content/site";
import { cn } from "@/lib/utils";
import { PlannedTag, StageFrame } from "./stage-frame";

// Stage i lights up once the chapter reaches step i; the final state lights all of them.
const LIT = [
  "",
  "group-data-[step=0]/chapter:border-border group-data-[step=0]/chapter:text-muted-foreground",
  "group-data-[step=0]/chapter:border-border group-data-[step=0]/chapter:text-muted-foreground group-data-[step=1]/chapter:border-border group-data-[step=1]/chapter:text-muted-foreground",
  "group-data-[step=0]/chapter:border-border group-data-[step=0]/chapter:text-muted-foreground group-data-[step=1]/chapter:border-border group-data-[step=1]/chapter:text-muted-foreground group-data-[step=2]/chapter:border-border group-data-[step=2]/chapter:text-muted-foreground",
  "group-data-[step=0]/chapter:border-border group-data-[step=0]/chapter:text-muted-foreground group-data-[step=1]/chapter:border-border group-data-[step=1]/chapter:text-muted-foreground group-data-[step=2]/chapter:border-border group-data-[step=2]/chapter:text-muted-foreground group-data-[step=3]/chapter:border-border group-data-[step=3]/chapter:text-muted-foreground",
];

/** Chapter 09: the delivery pipeline, plan to production. */
interface DeployFlowProps {
  content: SiteContent["stage"]["deploy"];
  planned: string;
}

export function DeployFlow({ content, planned }: DeployFlowProps) {
  return (
    <StageFrame label={content.file} status={<PlannedTag label={planned} />}>
      <ol className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {content.stages.map((stage, i) => (
          <li key={stage} className="flex items-center gap-2 sm:flex-1">
            {i > 0 ? (
              <span aria-hidden="true" className="hidden h-px flex-1 bg-border-strong sm:block" />
            ) : null}
            <span
              className={cn(
                "rounded-md border border-success/50 px-3 py-2 font-mono text-[0.8125rem] text-success transition-colors duration-500",
                LIT[i],
              )}
            >
              {stage}
            </span>
          </li>
        ))}
      </ol>
      {/* Progress bar follows the chapter's local progress. */}
      <div aria-hidden="true" className="mt-5 h-0.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full origin-left bg-primary"
          style={{ transform: "scaleX(var(--p, 1))" }}
        />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3">
        <span className="text-sm text-muted-foreground">{content.production}</span>
        <span className="font-mono text-sm text-primary">restaurant-pos.saqina.dev</span>
      </div>
    </StageFrame>
  );
}
