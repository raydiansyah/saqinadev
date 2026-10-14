import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ServiceDetail } from "@/components/services/service-detail";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { getService } from "@/lib/services/admin";
import { toPublicService } from "@/lib/services/public";

/** Renders the saved draft through the same serializer and component the public page uses. */
export default async function ServicePreviewPage({
  params,
}: PageProps<"/[locale]/dashboard/services/[id]/preview">) {
  const { id } = await params;
  const actor = await requireActorPage(`/dashboard/services/${id}/preview`);
  const missing = (error: unknown) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  };
  const row = await getService(actor, id).catch(missing);
  const [t, current] = await Promise.all([getTranslations("servicesAdmin.preview"), getLocale()]);
  const locale = current === "id" ? "id" : "en";
  const related = await Promise.all(
    row.relatedIds.map((rid) => getService(actor, rid).catch(() => null)),
  );
  const live = row.isPublished && row.isPublic && !row.archivedAt;

  return (
    <div className="space-y-4">
      <div
        role="note"
        className="flex flex-col gap-3 rounded-md border border-warning/50 bg-surface px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"
      >
        <p>{live ? t("bannerLive") : t("banner")}</p>
        <Link
          href={`/dashboard/services/${row.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("edit")}
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <ServiceDetail
          service={toPublicService(row, locale)}
          related={related.flatMap((r) => (r ? [toPublicService(r, locale)] : []))}
          locale={locale}
          preview
        />
      </div>
    </div>
  );
}
