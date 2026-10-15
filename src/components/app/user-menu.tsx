"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { signOutAction } from "@/app/[locale]/(app)/actions";
import { Link, usePathname } from "@/i18n/navigation";

/** Disclosure menu (no ARIA menu role: it holds a link and a form, not menu items). */
export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  /** Platform role: owners manage the platform, everyone else is a user. */
  role: "owner" | "user";
}) {
  const t = useTranslations("app.user");
  const locale = useLocale();
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  // Close on navigation and on Escape.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={t("menu")}
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full [&::-webkit-details-marker]:hidden"
      >
        <span className="flex size-8 items-center justify-center rounded-full border border-border-strong bg-surface-raised font-mono text-xs">
          {initials || "?"}
        </span>
      </summary>
      <div className="panel-in absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border-strong bg-surface p-2 shadow-lg">
        <div className="border-b border-border px-3 pt-1 pb-3">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
          <p
            className={
              role === "owner"
                ? "mt-2 inline-flex items-center rounded-full border border-primary/50 px-2 py-0.5 text-xs font-medium text-primary"
                : "mt-2 inline-flex items-center rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            <span className="sr-only">{t("role")}: </span>
            {t(role === "owner" ? "roleOwner" : "roleUser")}
          </p>
        </div>
        <Link
          href="/dashboard/settings"
          className="mt-1 flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-surface-raised"
        >
          {t("settings")}
        </Link>
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-surface-raised"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
    </details>
  );
}
