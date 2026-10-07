import { type Status, StatusBadge } from "@/components/primitives/status-badge";
import type { SiteContent } from "@/content/site";
import { cn } from "@/lib/utils";
import { PlannedTag, StageFrame } from "./stage-frame";

const STATUSES: Status[] = ["In Progress", "Waiting Approval", "Approved", "Completed"];

// Dim each status until the chapter step reaches it; all are lit in the final state.
const REACHED = [
  "",
  "group-data-[step=0]/chapter:opacity-30",
  "group-data-[step=0]/chapter:opacity-30 group-data-[step=1]/chapter:opacity-30",
  "group-data-[step=0]/chapter:opacity-30 group-data-[step=1]/chapter:opacity-30 group-data-[step=2]/chapter:opacity-30",
];

/** Chapter 07: an external agent talks to the project through MCP. */
interface McpFlowProps {
  content: SiteContent["stage"]["mcp"];
  planned: string;
  statuses: Record<string, string>;
}

export function McpFlow({ content, planned, statuses }: McpFlowProps) {
  return (
    <StageFrame label={content.file} status={<PlannedTag label={planned} />}>
      <div className="flex flex-col items-center gap-0 text-sm">
        <span className="rounded-md border border-border px-4 py-2">Agent</span>
        <span aria-hidden="true" className="h-4 w-px bg-border-strong" />
        <span className="rounded-md border border-info/50 px-4 py-2 font-mono text-info">MCP</span>
        <span aria-hidden="true" className="h-4 w-px bg-border-strong" />
        <span className="rounded-md border border-border-strong px-4 py-2 font-medium">
          Saqina Dev
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-border-strong" />
        <div className="grid w-full max-w-sm grid-cols-3 gap-2 text-center">
          {["Tasks", "PRD", "Memory"].map((t) => (
            <span key={t} className="rounded-md border border-border px-2 py-1.5 font-mono text-xs">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-6 rounded-md border border-border">
        <p className="border-b border-border px-4 py-2.5 text-sm">{content.task}</p>
        <ol className="flex flex-wrap gap-2 px-4 py-3" aria-label={content.history}>
          {STATUSES.map((s, i) => (
            <li key={s} className={cn("transition-opacity duration-500", REACHED[i])}>
              <StatusBadge status={s} label={statuses[s]} />
            </li>
          ))}
        </ol>
        <ol className="space-y-1 border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground">
          {content.log.map((line, i) => (
            <li key={line} className={cn("transition-opacity duration-500", REACHED[i])}>
              {line}
            </li>
          ))}
        </ol>
      </div>
    </StageFrame>
  );
}
