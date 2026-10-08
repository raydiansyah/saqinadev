"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { ProjectSidebarNav, type SidebarProject } from "./project-sidebar";

/** Below desktop the sidebar becomes a sheet on the native <dialog> (focus trap, Escape). */
export function ProjectDrawer({ project }: { project: SidebarProject }) {
  const t = useTranslations("project.sidebar");
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close when the route changes
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        aria-expanded={open}
        className="-ml-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground lg:hidden"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none">
          <path
            d="M2 4h12M2 8h12M2 12h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        aria-label={t("label")}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-border-strong bg-background p-0 pt-3 text-foreground backdrop:bg-black/60 open:animate-[panel-in_200ms_ease-out] motion-reduce:open:animate-none"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
          className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
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
        <ProjectSidebarNav project={project} onNavigate={() => setOpen(false)} />
      </dialog>
    </>
  );
}
