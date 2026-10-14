"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Services | Inquiries (with the count of new ones). The editor pages belong to Services. */
export function ServicesSubnav({ newInquiries }: { newInquiries: number }) {
  const t = useTranslations("servicesAdmin.nav");
  const pathname = usePathname();
  const onInquiries = pathname.startsWith("/dashboard/services/inquiries");
  const items = [
    { href: "/dashboard/services", label: t("services"), active: !onInquiries, count: 0 },
    {
      href: "/dashboard/services/inquiries",
      label: t("inquiries"),
      active: onInquiries,
      count: newInquiries,
    },
  ];
  return (
    <nav aria-label={t("label")} className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                item.active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              {item.count > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground">
                  {item.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
