"use client";

import { useLocale, useTranslations } from "next-intl";
import { LOCALES } from "@/i18n/locales";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Links to the same page in each language. Plain links (not a select) so it works without
 * JavaScript and every option is reachable by keyboard.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common.language");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className={className}>
      <ul className="flex items-center gap-1">
        {LOCALES.map((l) => (
          <li key={l}>
            <Link
              href={pathname}
              locale={l}
              hrefLang={l}
              lang={l}
              aria-current={l === locale ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2 font-mono text-xs uppercase transition-colors",
                l === locale ? "text-foreground" : "text-subtle-foreground hover:text-foreground",
              )}
            >
              {/* The accessible name starts with the visible code, then names the language. */}
              {l}
              <span className="sr-only">
                {" "}
                {l === locale ? t(l) : t("switchTo", { language: t(l) })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
