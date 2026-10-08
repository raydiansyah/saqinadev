import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { ActivityList } from "@/components/project/activity-list";
import { listRecentActivityForUser } from "@/lib/activity/service";
import { requireActorPage } from "@/lib/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.activity");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function DashboardActivityPage() {
  const actor = await requireActorPage("/dashboard/activity");
  const items = await listRecentActivityForUser(actor.id, 50);
  const t = await getTranslations("app.activity");
  return (
    <>
      <PageHeading title={t("title")} />
      {items.length > 0 ? (
        <ActivityList items={items} viewerName={actor.name} showProject />
      ) : (
        <EmptyState title={t("title")} body={t("empty")} />
      )}
    </>
  );
}
