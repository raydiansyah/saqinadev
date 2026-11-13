import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/primitives/logo";
import { Link } from "@/i18n/navigation";
import type { Actor } from "@/lib/auth/actor";
import { isPlatformOwner } from "@/lib/platform/roles";
import { UserMenu } from "./user-menu";

/** Top bar shared by the dashboard and project workspace. */
export async function AppHeader({ actor, leading }: { actor: Actor; leading?: ReactNode }) {
  const [t, owner] = await Promise.all([getTranslations("app"), isPlatformOwner(actor)]);
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
        <div className="ml-auto flex items-center gap-3">
          <NotificationBell actor={actor} href="/dashboard/notifications" />
          <UserMenu name={actor.name} email={actor.email} role={owner ? "owner" : "user"} />
        </div>
      </div>
    </header>
  );
}
