"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NavKey =
  | "overview"
  | "clients"
  | "projects"
  | "invoices"
  | "payments"
  | "reminders"
  | "activity"
  | "settings"
  | "docs";

const SIMPLE: { key: NavKey; href: string }[] = [
  { key: "overview", href: "/dashboard" },
  { key: "clients", href: "/dashboard/clients" },
  { key: "projects", href: "/dashboard/projects" },
  { key: "invoices", href: "/dashboard/invoices" },
  { key: "payments", href: "/dashboard/payments" },
  { key: "reminders", href: "/dashboard/reminders" },
  { key: "activity", href: "/dashboard/activity" },
  { key: "settings", href: "/dashboard/settings" },
  { key: "docs", href: "/dashboard/docs" },
];

export function DashboardNav() {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  const items = SIMPLE;
  return (
    <nav aria-label={t("label")} className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto px-4 sm:px-6">
        {items.map((item) => {
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
