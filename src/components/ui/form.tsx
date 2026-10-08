import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const FIELD_CLASS =
  "w-full rounded-md border border-border-strong bg-surface px-3.5 text-[0.9375rem] text-foreground placeholder:text-subtle-foreground focus-visible:border-primary aria-invalid:border-error";

interface FieldProps extends ComponentProps<"input"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

/** Labelled input with hint and error wired to aria-describedby and aria-invalid. */
export function Field({ id, label, hint, error, className, ...props }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(FIELD_CLASS, "min-h-11 py-2.5", className)}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-subtle-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextAreaProps extends ComponentProps<"textarea"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}

export function TextArea({ id, label, hint, error, className, ...props }: TextAreaProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(FIELD_CLASS, "resize-y py-2.5 leading-relaxed", className)}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-subtle-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface SelectProps extends ComponentProps<"select"> {
  id: string;
  label: string;
  error?: string;
}

export function Select({ id, label, error, className, children, ...props }: SelectProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(FIELD_CLASS, "min-h-11 py-2", className)}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const TONES = {
  error: "border-error/50 text-error",
  warning: "border-warning/50 text-warning",
  info: "border-info/40 text-info",
  success: "border-success/40 text-success",
} as const;

/** Form-level message. Errors use role="alert" so they are announced immediately. */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border bg-surface px-4 py-3 text-sm", TONES[tone], className)}
    >
      {children}
    </div>
  );
}
