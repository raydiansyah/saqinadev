"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TABS = ["overview", "progress", "features", "documents", "invoices", "payments"] as const;

/** Section tabs for one shared project. Scrolls horizontally on narrow screens. */
export function ProjectTabs({ slug }: { slug: string }) {
  const t = useTranslations("portal.tabs");
  const pathname = usePathname();
  const base = `/portal/projects/${slug}`;
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 print:hidden">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {TABS.map((tab) => {
          const href = tab === "overview" ? base : `${base}/${tab}`;
          const active = tab === "overview" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={tab}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(tab)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
