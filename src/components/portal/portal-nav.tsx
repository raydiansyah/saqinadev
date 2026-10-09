"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "dashboard", href: "/portal", exact: true },
  { key: "projects", href: "/portal/projects", exact: false },
  { key: "profile", href: "/portal/profile", exact: false },
] as const;

/** Top-level portal navigation; the current section carries aria-current. */
export function PortalNav() {
  const t = useTranslations("portal.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="overflow-x-auto">
      <ul className="flex items-center gap-1">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md px-3 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-surface-raised font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
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
