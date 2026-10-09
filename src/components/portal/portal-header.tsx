import { getLocale, getTranslations } from "next-intl/server";
import { signOutAction } from "@/app/[locale]/(app)/actions";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/primitives/logo";
import { Link } from "@/i18n/navigation";
import type { Actor } from "@/lib/auth/actor";
import { PortalNav } from "./portal-nav";

/** Client portal top bar. Links only to portal pages; never to the internal workspace. */
export async function PortalHeader({ actor }: { actor: Actor }) {
  const t = await getTranslations("portal.nav");
  const locale = await getLocale();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/portal"
          className="inline-flex min-h-11 items-center rounded-sm"
          aria-label={t("brandHome")}
        >
          <Logo />
        </Link>
        <div className="ml-auto hidden md:block">
          <PortalNav />
        </div>
        <LanguageSwitcher className="ml-auto md:ml-0" />
        <NotificationBell actor={actor} href="/portal/notifications" />
        <span className="hidden max-w-40 truncate text-sm text-muted-foreground lg:inline">
          {actor.name}
        </span>
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
      <div className="mx-auto w-full max-w-5xl border-t border-border px-2 md:hidden">
        <PortalNav />
      </div>
    </header>
  );
}
