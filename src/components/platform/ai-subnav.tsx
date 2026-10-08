"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", href: "/dashboard/ai" },
  { key: "providers", href: "/dashboard/ai/providers" },
  { key: "models", href: "/dashboard/ai/models" },
  { key: "mapping", href: "/dashboard/ai/mapping" },
  { key: "policies", href: "/dashboard/ai/policies" },
] as const;

export function AiSubnav() {
  const t = useTranslations("platform.tabs");
  const pathname = usePathname();
  return (
    <nav aria-label={t("overview")} className="-mx-1 flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active =
          tab.href === "/dashboard/ai" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-md px-3 text-sm whitespace-nowrap",
              active
                ? "bg-surface-raised font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
