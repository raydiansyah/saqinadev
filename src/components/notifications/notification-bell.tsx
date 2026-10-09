import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Actor } from "@/lib/auth/actor";
import { log } from "@/lib/log";
import { unreadCount } from "@/lib/notifications/service";

/** Header bell: links to the notifications page and announces the unread count. */
export async function NotificationBell({ actor, href }: { actor: Actor; href: string }) {
  const t = await getTranslations("notifications");
  // The header renders on every page; a failed count must not take the page down.
  const count = await unreadCount(actor).catch((error: unknown) => {
    log.warn("notification.unread_count_failed", { error: String(error) });
    return 0;
  });
  return (
    <Link
      href={href}
      aria-label={t("bellLabel", { count })}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none">
        <path
          d="M4 6.5a4 4 0 1 1 8 0c0 3 1.25 4.25 1.25 4.25H2.75S4 9.5 4 6.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M6.5 13a1.6 1.6 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 font-semibold text-primary-foreground"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
