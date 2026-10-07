"use client";

import { useRef, useState } from "react";
import { StatusBadge } from "@/components/primitives/status-badge";
import { Button } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import { StageFrame } from "./stage-frame";

type Phase = "proposed" | "review" | "approved" | "revision" | "rejected";

/** Chapter 08: a working approval gate. Local state only; no agent is involved. */
interface ApprovalDemoProps {
  content: SiteContent["stage"]["approval"];
  demo: string;
  statuses: Record<string, string>;
}

export function ApprovalDemo({ content: c, demo, statuses }: ApprovalDemoProps) {
  const [phase, setPhase] = useState<Phase>("proposed");
  const statusRef = useRef<HTMLParagraphElement>(null);

  const decide = (next: Phase) => {
    setPhase(next);
    // Keep focus inside the card so keyboard users hear the outcome.
    requestAnimationFrame(() => statusRef.current?.focus());
  };

  const badge =
    phase === "approved"
      ? "Approved"
      : phase === "revision"
        ? "Revision"
        : phase === "rejected"
          ? "Rejected"
          : "Waiting Approval";

  return (
    <StageFrame
      label={c.file}
      status={<span className="font-mono text-[0.6875rem] text-subtle-foreground">{demo}</span>}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-lg font-medium">{c.title}</p>
        <StatusBadge status={badge} label={statuses[badge]} />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{c.impact}</p>

      {phase === "proposed" ? (
        <Button variant="outline" className="mt-6" onClick={() => setPhase("review")}>
          {c.review}
        </Button>
      ) : null}

      {phase === "review" ? (
        <div className="mt-5">
          <ul className="space-y-1.5 rounded-md border border-border bg-background p-4 font-mono text-[0.8125rem] text-muted-foreground">
            {c.changes.map((change) => (
              <li key={change}>+ {change}</li>
            ))}
          </ul>
          <p className="mt-5 font-mono text-xs text-warning">{c.required}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" onClick={() => decide("rejected")}>
              {c.reject}
            </Button>
            <Button variant="outline" onClick={() => decide("revision")}>
              {c.revision}
            </Button>
            <Button onClick={() => decide("approved")}>{c.approve}</Button>
          </div>
        </div>
      ) : null}

      {phase === "approved" || phase === "revision" || phase === "rejected" ? (
        <div className="mt-5">
          <p
            ref={statusRef}
            tabIndex={-1}
            aria-live="polite"
            className="text-sm focus-visible:outline-none"
          >
            {phase === "approved"
              ? c.outcomes.approved
              : phase === "revision"
                ? c.outcomes.revision
                : c.outcomes.rejected}
          </p>
          {phase === "approved" ? (
            <ol className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs">
              {c.continues.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  {i > 0 ? <span aria-hidden="true" className="h-px w-4 bg-border-strong" /> : null}
                  <span className="rounded-sm border border-success/40 px-1.5 py-0.5 text-success">
                    {s}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => setPhase("proposed")}>
            {c.again}
          </Button>
        </div>
      ) : null}
    </StageFrame>
  );
}
