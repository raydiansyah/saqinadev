import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo } from "@/components/primitives/logo";
import { Link } from "@/i18n/navigation";
import type { Actor } from "@/lib/auth/actor";
import { UserMenu } from "./user-menu";

/** Top bar shared by the dashboard and project workspace. */
export async function AppHeader({
  actor,
  locale,
  leading,
  trailing,
}: {
  actor: Actor;
  locale: string;
  leading?: ReactNode;
  /** Project-level actions next to the user menu (Ask Saqina). */
  trailing?: ReactNode;
}) {
  const t = await getTranslations("app");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        {leading}
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center rounded-sm"
          aria-label={t("brandHome")}
        >
          <Logo />
        </Link>
        <form
          role="search"
          action={`/${locale}/dashboard/search`}
          className="ml-auto hidden max-w-xs flex-1 sm:block"
        >
          <label htmlFor="global-search" className="sr-only">
            {t("search.label")}
          </label>
          <input
            id="global-search"
            name="q"
            type="search"
            minLength={2}
            maxLength={100}
            placeholder={t("search.placeholder")}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm placeholder:text-subtle-foreground focus-visible:border-primary"
          />
        </form>
        <Link
          href="/dashboard/search"
          aria-label={t("search.title")}
          className="ml-auto inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground sm:hidden"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m10.5 10.5 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </Link>
        {trailing}
        <UserMenu name={actor.name} email={actor.email} />
      </div>
    </header>
  );
}
