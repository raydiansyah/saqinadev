"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Modal built on the native <dialog>: focus is trapped and Escape closes it without extra
 * code. Focus returns to the element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("app.states");
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      // Start in the first field, not on the close button.
      dialog.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-desc` : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border-strong bg-surface p-0 text-foreground backdrop:bg-black/60 open:animate-[dialog-in_160ms_ease-out] motion-reduce:open:animate-none",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 id={`${id}-title`} className="font-semibold">
            {title}
          </h2>
          {description ? (
            <p id={`${id}-desc`} className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none">
            <path
              d="M3 3l10 10M13 3 3 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </dialog>
  );
}
