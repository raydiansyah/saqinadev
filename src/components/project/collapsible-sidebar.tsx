"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "saqina.project-sidebar";

/**
 * The project sidebar on wide screens, which a person can fold away to give the work area the
 * full width. The choice is a per-browser convenience; without storage it simply starts open.
 */
export function CollapsibleSidebar({ children }: { children: ReactNode }) {
  const t = useTranslations("project.sidebar");
  const id = useId();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "closed") setOpen(false);
    } catch {}
  }, []);

  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(KEY, v ? "closed" : "open");
      } catch {}
      return !v;
    });
  };

  return (
    <aside
      className={cn(
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 border-r border-border pt-4 transition-[width] duration-200 motion-reduce:transition-none lg:block",
        open ? "w-60" : "w-11",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? t("collapse") : t("expand")}
        title={open ? t("collapse") : t("expand")}
        className={cn(
          "absolute top-2 z-10 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground",
          open ? "right-2" : "left-1.5",
        )}
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="3" y="4" width="14" height="12" rx="2" />
          <path d="M8 4v12" />
        </svg>
      </button>
      <div id={id} hidden={!open} className="h-full pt-6">
        {children}
      </div>
    </aside>
  );
}
