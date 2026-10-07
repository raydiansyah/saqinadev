import type { SiteContent } from "@/content/site";
import { fromStep, PlannedTag, StageFrame } from "./stage-frame";

interface MemoryFlowProps {
  content: SiteContent["stage"]["memory"];
  planned: string;
}

/** Chapter 06: a decision survives the end of a session through MEMORY.md. */
export function MemoryFlow({ content, planned }: MemoryFlowProps) {
  return (
    <StageFrame label={content.file} status={<PlannedTag label={planned} />}>
      <ol className="space-y-3">
        <li className="rounded-md border border-border p-4">
          <p className="font-mono text-xs text-subtle-foreground">{content.session1}</p>
          <p className="mt-1.5 text-sm">{content.decision}</p>
        </li>
        <li className={fromStep[1]}>
          <div aria-hidden="true" className="mx-auto h-4 w-px bg-border-strong" />
          {/* The same MEMORY.md block stays on screen through the session change. */}
          <div className="rounded-md border border-primary/50 bg-background p-4 font-mono text-[0.8125rem]">
            <p className="text-foreground">MEMORY.md</p>
            <p className="mt-1 text-muted-foreground">{content.memoryLine}</p>
          </div>
          <p className="mt-3 text-center font-mono text-xs text-subtle-foreground">
            {content.sessionEnds}
          </p>
        </li>
        <li className={fromStep[2]}>
          <div className="rounded-md border border-border p-4">
            <p className="font-mono text-xs text-subtle-foreground">{content.session2}</p>
            <p className="mt-1.5 text-sm">{content.restored}</p>
          </div>
        </li>
      </ol>
    </StageFrame>
  );
}
