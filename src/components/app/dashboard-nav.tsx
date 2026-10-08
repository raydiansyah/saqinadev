"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "overview", href: "/dashboard" },
  { key: "projects", href: "/dashboard/projects" },
  { key: "activity", href: "/dashboard/activity" },
  { key: "settings", href: "/dashboard/settings" },
] as const;

export function DashboardNav() {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto px-4 sm:px-6">
        {ITEMS.map((item) => {
          const active =
            item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
