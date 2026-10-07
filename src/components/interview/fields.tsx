"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-md border border-border-strong bg-surface px-3.5 py-3 text-[0.9375rem] text-foreground placeholder:text-subtle-foreground focus-visible:border-primary";

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  maxLength?: number;
  rows?: number;
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  description,
  maxLength = 2000,
  rows = 4,
}: TextAreaFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-medium">
        {label}
      </label>
      {description ? (
        <p id={`${id}-desc`} className="mb-2 text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={description ? `${id}-desc` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(FIELD, "resize-y leading-relaxed")}
      />
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 120,
}: TextFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(FIELD, "min-h-11 py-2.5")}
      />
    </div>
  );
}
