"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { FormState } from "./form-state";

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void;
export type Errors = Record<string, string>;

export interface SectionProps {
  state: FormState;
  set: SetField;
  errors: Errors;
}

/** First message whose path is `prefix` or lives below it (`problems.en` covers `problems.en.2`). */
export function errorAt(errors: Errors, prefix: string): string | undefined {
  for (const [path, message] of Object.entries(errors))
    if (path === prefix || path.startsWith(`${prefix}.`)) return message;
  return undefined;
}

/** Card with a heading; the id lets the section nav link to it. */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 space-y-5 rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LocaleTabs<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  flagged,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  flagged?: T[];
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border">
      {options.map((o) => (
        <button
          key={o.value}
          id={`${id}-tab-${o.value}`}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          aria-controls={`${id}-panel`}
          onClick={() => onChange(o.value)}
          className={cn(
            "-mb-px inline-flex min-h-11 cursor-pointer items-center gap-2 border-b-2 px-4 text-sm",
            value === o.value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {flagged?.includes(o.value) ? (
            <span aria-hidden="true" className="text-error">
              !
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
