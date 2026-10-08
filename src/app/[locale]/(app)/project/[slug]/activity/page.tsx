import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { ActivityList } from "@/components/project/activity-list";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listActivity } from "@/lib/activity/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("activity");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Cursor is "<iso timestamp>_<uuid>"; anything malformed starts from the newest page. */
function parseCursor(value: string | string[] | undefined) {
  if (typeof value !== "string") return undefined;
  const [time, id] = value.split("_");
  const createdAt = new Date(time ?? "");
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id ?? "")) return undefined;
  return { createdAt, id: id as string };
}

export default async function ProjectActivityPage({
  params,
  searchParams,
}: PageProps<"/[locale]/project/[slug]/activity">) {
  const { slug } = await params;
  const { project, actor } = await projectPageAccess(slug);
  const before = parseCursor((await searchParams).before);
  const { items, next } = await listActivity(project.id, { before });
  const t = await getTranslations("activity");

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      {items.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <>
          <ActivityList items={items} viewerName={actor.name} />
          {next ? (
            <Link
              href={`/project/${slug}/activity?before=${next.createdAt.toISOString()}_${next.id}`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "mt-8" })}
            >
              {t("older")}
            </Link>
          ) : null}
        </>
      )}
    </>
  );
}
