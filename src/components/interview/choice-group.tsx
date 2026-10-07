"use client";

import type { Option } from "@/lib/interview/options";
import { cn } from "@/lib/utils";

interface BaseProps<T extends string> {
  name: string;
  options: Option<T>[];
  /** Visible legend; omit when `labelledBy` points at the step heading. */
  legend?: string;
  labelledBy?: string;
  columns?: 1 | 2 | 3;
  className?: string;
}

interface SingleProps<T extends string> extends BaseProps<T> {
  multiple?: false;
  value: T | undefined;
  onChange: (value: T) => void;
}

interface MultipleProps<T extends string> extends BaseProps<T> {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
}

const COLUMNS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" } as const;

/** Native radio/checkbox inputs styled as large, touch-friendly tiles. */
export function ChoiceGroup<T extends string>(props: SingleProps<T> | MultipleProps<T>) {
  const { name, options, legend, labelledBy, columns = 2, className } = props;
  const isChecked = (id: T) => (props.multiple ? props.value.includes(id) : props.value === id);

  const toggle = (id: T) => {
    if (props.multiple) {
      props.onChange(
        props.value.includes(id) ? props.value.filter((v) => v !== id) : [...props.value, id],
      );
    } else {
      props.onChange(id);
    }
  };

  return (
    <fieldset aria-labelledby={labelledBy} className={className}>
      {legend ? <legend className="mb-3 font-medium">{legend}</legend> : null}
      <div className={cn("grid gap-2", COLUMNS[columns])}>
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 transition-colors",
              "hover:border-border-strong has-[:checked]:border-primary has-[:checked]:bg-primary/[0.07]",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            )}
          >
            <input
              type={props.multiple ? "checkbox" : "radio"}
              name={name}
              value={option.id}
              checked={isChecked(option.id)}
              onChange={() => toggle(option.id)}
              className="mt-1 size-4 shrink-0 accent-[var(--primary)] focus-visible:outline-none"
            />
            <span>
              <span className="block text-[0.9375rem] font-medium">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
