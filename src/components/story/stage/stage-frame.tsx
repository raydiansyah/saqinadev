import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Common frame for chapter visuals: one bordered surface with an optional status line. */
export function StageFrame({
  label,
  status,
  children,
  className,
}: {
  label: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("rounded-lg border border-border bg-surface", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="font-mono text-xs text-subtle-foreground">{label}</span>
        {status}
      </figcaption>
      <div className="p-4 sm:p-6">{children}</div>
    </figure>
  );
}

export function PlannedTag({ label }: { label: string }) {
  return (
    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[0.6875rem] text-subtle-foreground">
      {label}
    </span>
  );
}

/** Step classes: hide an element until the chapter reaches a step. Final state by default. */
export const fromStep = {
  1: "transition-[opacity,transform] duration-500 group-data-[step=0]/chapter:translate-y-2 group-data-[step=0]/chapter:opacity-0",
  2: "transition-[opacity,transform] duration-500 group-data-[step=0]/chapter:translate-y-2 group-data-[step=0]/chapter:opacity-0 group-data-[step=1]/chapter:translate-y-2 group-data-[step=1]/chapter:opacity-0",
  3: "transition-[opacity,transform] duration-500 group-data-[step=0]/chapter:opacity-0 group-data-[step=1]/chapter:opacity-0 group-data-[step=2]/chapter:opacity-0 group-data-[step=0]/chapter:translate-y-2 group-data-[step=1]/chapter:translate-y-2 group-data-[step=2]/chapter:translate-y-2",
  4: "transition-[opacity,transform] duration-500 group-data-[step=0]/chapter:opacity-0 group-data-[step=1]/chapter:opacity-0 group-data-[step=2]/chapter:opacity-0 group-data-[step=3]/chapter:opacity-0",
} as const;
