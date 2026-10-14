"use client";

import { cn } from "@/lib/utils";

/** Toggle button exposed as a switch. Used both in the editor and the list quick switches. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
  describedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-border-strong bg-surface-raised",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-4 rounded-full bg-background shadow transition-transform motion-reduce:transition-none",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

/** A switch with a visible label and one-line explanation. */
export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface p-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        label={label}
        describedBy={`${id}-hint`}
        disabled={disabled}
      />
    </div>
  );
}
