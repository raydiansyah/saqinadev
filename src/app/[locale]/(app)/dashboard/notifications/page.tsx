import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireActorPage } from "@/lib/auth/server";
import { listNotifications } from "@/lib/notifications/service";
import { markNotificationReadAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function NotificationsPage() {
  const actor = await requireActorPage("/dashboard/notifications");
  const [notifications, t] = await Promise.all([
    listNotifications(actor),
    getTranslations("notifications"),
  ]);
  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <NotificationList notifications={notifications} markRead={markNotificationReadAction} />
    </>
  );
}
