"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PROJECT_NAV } from "./nav-items";

export interface SidebarProject {
  slug: string;
  name: string;
  statusLabel: string;
  /** Proposals waiting for review; shown as a count next to Approvals. */
  pendingApprovals?: number;
}

/** Project-aware navigation. The current page is marked with aria-current and a bar. */
export function ProjectSidebarNav({
  project,
  onNavigate,
}: {
  project: SidebarProject;
  onNavigate?: () => void;
}) {
  const t = useTranslations("project.sidebar");
  const pathname = usePathname();
  const base = `/project/${project.slug}`;

  return (
    <nav aria-label={t("label")} className="flex h-full flex-col">
      <div className="border-b border-border px-3 pb-4">
        <Link
          href="/dashboard/projects"
          onClick={onNavigate}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden="true">←</span> {t("allProjects")}
        </Link>
        <p className="mt-1 truncate px-2 font-semibold" title={project.name}>
          {project.name}
        </p>
        <p className="px-2 font-mono text-xs text-muted-foreground">{project.statusLabel}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {PROJECT_NAV.map((section, i) => (
          <div key={section.group ?? `top-${i}`} className={cn(i > 0 && "mt-4")}>
            {section.group ? (
              <p className="px-2 pb-1 font-mono text-[0.6875rem] tracking-wide text-subtle-foreground uppercase">
                {t(`groups.${section.group}`)}
              </p>
            ) : null}
            <ul>
              {section.items.map((item) => {
                const href = `${base}${item.path}`;
                const active = item.path === "" ? pathname === base : pathname.startsWith(href);
                return (
                  <li key={item.key}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex min-h-10 items-center rounded-md px-2 text-sm transition-colors",
                        active
                          ? "bg-surface-raised font-medium text-foreground before:absolute before:inset-y-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-primary"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      {t(`items.${item.key}`)}
                      {item.key === "approvals" && project.pendingApprovals ? (
                        <span className="ml-auto rounded-md border border-warning/50 px-1.5 font-mono text-xs text-warning">
                          {project.pendingApprovals}
                          <span className="sr-only"> {t("pending")}</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
