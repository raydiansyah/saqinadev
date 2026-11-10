"use client";

import { useTranslations } from "next-intl";
import { type ComponentProps, useState } from "react";
import { FIELD_CLASS } from "@/components/ui/form";
import { cn } from "@/lib/utils";

interface PasswordFieldProps extends Omit<ComponentProps<"input">, "type"> {
  id: string;
  label: string;
  error?: string;
}

/**
 * Password input with a show/hide toggle. The toggle is a real button with a name for screen
 * readers and a 44 px target; the value is never copied anywhere else.
 */
export function PasswordField({ id, label, error, className, ...props }: PasswordFieldProps) {
  const t = useTranslations("auth.fields");
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? t("hidePassword") : t("showPassword");

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(FIELD_CLASS, "min-h-11 py-2.5 pr-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={toggleLabel}
          aria-pressed={visible}
          title={toggleLabel}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:text-foreground"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
            <circle cx="8" cy="8" r="2" />
            {visible ? <path d="M2.5 2.5l11 11" /> : null}
          </svg>
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
