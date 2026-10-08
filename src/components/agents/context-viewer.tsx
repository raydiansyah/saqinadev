"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ContextFileView {
  name: string;
  content: string;
}

const lineCount = (text: string) => text.replace(/\n$/, "").split("\n").length;

/**
 * Tabbed preview of the serialised context files (WAI-ARIA tabs with roving focus).
 * Content is computed on the server; this component only displays and copies it.
 */
export function ContextViewer({ files, bundle }: { files: ContextFileView[]; bundle: string }) {
  const t = useTranslations("agents.context");
  const states = useTranslations("app.states");
  const id = useId();
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const file = files[active];

  function select(index: number) {
    const next = (index + files.length) % files.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: files.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(moves[event.key]);
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setAnnouncement(message);
    } catch {
      setAnnouncement("");
    }
  }

  if (!file) return null;

  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <h3 className="px-2 text-sm font-medium text-muted-foreground">{t("preview")}</h3>
        <div className="flex items-center gap-3">
          <p aria-live="polite" className="text-xs text-success">
            {announcement}
          </p>
          <Button size="sm" onClick={() => copy(bundle, t("copied"))}>
            {t("copy")}
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("files")}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-border px-2"
      >
        {files.map((f, i) => (
          <button
            key={f.name}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={cn(
              "-mb-px min-h-11 shrink-0 border-b-2 px-3 font-mono text-xs transition-colors",
              i === active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        tabIndex={0}
        className="focus-visible:outline-offset-[-2px]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <p className="font-mono text-xs text-subtle-foreground">
            {file.name} · {t("lines", { count: lineCount(file.content) })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${states("copy")} ${file.name}`}
            onClick={() => copy(file.content, `${states("copied")}: ${file.name}`)}
          >
            {states("copy")}
          </Button>
        </div>
        <pre className="max-h-[32rem] overflow-auto border-t border-border px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {file.content}
        </pre>
      </div>
    </div>
  );
}
