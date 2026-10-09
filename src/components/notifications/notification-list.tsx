import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import type { NotificationView } from "@/lib/notifications/service";
import { type MarkReadAction, NotificationItems } from "./notification-items";
import { type LooseT, renderNotification } from "./render";

/** Renders stored notifications (type + params) into text on the server, then lists them. */
export async function NotificationList({
  notifications,
  markRead,
}: {
  notifications: NotificationView[];
  markRead: MarkReadAction;
}) {
  const [t, format, locale] = await Promise.all([
    getTranslations("notifications"),
    getFormatter(),
    getLocale(),
  ]);
  if (notifications.length === 0)
    return <EmptyState title={t("empty.title")} body={t("empty.body")} />;
  const items = notifications.map((n) => ({
    id: n.id,
    href: n.href,
    unread: n.readAt === null,
    time: format.dateTime(n.createdAt, { dateStyle: "medium", timeStyle: "short" }),
    iso: n.createdAt.toISOString(),
    ...renderNotification(t as unknown as LooseT, n, locale),
  }));
  return <NotificationItems items={items} markRead={markRead} />;
}
