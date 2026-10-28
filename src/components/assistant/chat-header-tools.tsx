"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ChapterItem } from "./types";

/** Pinned messages as a list of places to jump to. Closed until opened. */
export function ChaptersMenu({
  chapters,
  onJump,
}: {
  chapters: ChapterItem[];
  onJump: (messageId: string) => void;
}) {
  const t = useTranslations("assistant.tools");
  if (chapters.length === 0) return null;
  return (
    <details
      className="group"
      onKeyDown={(e) => {
        // Escape closes the list and hands focus back to its button.
        if (e.key !== "Escape") return;
        const el = e.currentTarget;
        if (!el.open) return;
        e.stopPropagation();
        el.removeAttribute("open");
        el.querySelector("summary")?.focus();
      }}
    >
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="currentColor">
          <path d="M4 2h8v12l-4-3-4 3z" />
        </svg>
        {t("chaptersCount", { count: chapters.length })}
      </summary>
      {/* Anchored to the header, not to the button: the header is as wide as the chat. */}
      <ol className="absolute inset-x-3 top-full z-10 mt-1 max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border-strong bg-surface p-1 shadow-lg">
        {chapters.map((chapter, i) => (
          <li key={chapter.messageId}>
            <button
              type="button"
              onClick={(e) => {
                onJump(chapter.messageId);
                // Close the list so the thread is visible again.
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
              aria-label={t("jumpTo", { title: chapter.title })}
              className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-surface-raised"
            >
              <span className="font-mono text-xs text-subtle-foreground">{i + 1}</span>
              <span className="min-w-0 truncate">{chapter.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** The owner opens this thread to connected agents, or closes it again. */
export function AgentAccessToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const t = useTranslations("assistant.agentAccess");
  const hintId = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-describedby={hintId}
        onClick={() => onChange(!enabled)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-block h-4 w-7 shrink-0 rounded-full border transition-colors motion-reduce:transition-none",
            enabled ? "border-primary bg-primary" : "border-border-strong bg-transparent",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-2.5 rounded-full transition-all motion-reduce:transition-none",
              enabled ? "left-3.5 bg-primary-foreground" : "left-0.5 bg-muted-foreground",
            )}
          />
        </span>
        {t("label")}
      </button>
      <span id={hintId} className="sr-only">
        {t("hint")}
      </span>
    </div>
  );
}

/** Shown on a fork: where it came from. */
export function ForkBanner({
  slug,
  parent,
}: {
  slug: string;
  parent: { id: string; title: string };
}) {
  const t = useTranslations("assistant.tools");
  return (
    <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
      {t("forkedFrom")}{" "}
      <Link
        href={`/project/${slug}/assistant?c=${parent.id}`}
        className="font-medium text-foreground underline underline-offset-2"
      >
        {parent.title}
      </Link>
    </p>
  );
}
