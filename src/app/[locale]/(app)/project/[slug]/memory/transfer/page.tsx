import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { ImportForm } from "@/components/memory/import-form";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { getOverview } from "@/lib/memory/queries";
import { countExportParts } from "@/lib/memory/transfer/export";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.transfer");
  return { title: t("title"), robots: { index: false } };
}

export default async function TransferPage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/transfer">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [overview, exportParts, t] = await Promise.all([
    getOverview(access),
    countExportParts(access.actor, slug),
    getTranslations("memoryHub.transfer"),
  ]);
  const admin = access.role === "owner" || access.role === "admin";

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <MemoryTabs slug={slug} active="transfer" pending={overview.pendingReview} admin={admin} />
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="export" className="space-y-3">
          <h2 id="export" className="text-sm font-medium text-muted-foreground">
            {t("exportTitle")}
          </h2>
          <p className="max-w-prose text-sm text-pretty">{t("exportBody")}</p>
          {/* A plain link: the file comes from the server with the session cookie, never cached. */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: exportParts.parts }, (_, i) => i + 1).map((n) => (
              <a
                key={n}
                href={`/api/projects/${slug}/memory/export${exportParts.parts > 1 ? `?part=${n}` : ""}`}
                download
                className={buttonVariants({ variant: "outline" })}
              >
                {exportParts.parts > 1
                  ? t("exportPart", { n, of: exportParts.parts })
                  : t("exportButton")}
              </a>
            ))}
          </div>
        </section>
        <section aria-labelledby="import" className="space-y-3">
          <h2 id="import" className="text-sm font-medium text-muted-foreground">
            {t("importTitle")}
          </h2>
          <p className="max-w-prose text-sm text-pretty">{t("importBody")}</p>
          {can(access.role, "content:write") ? <ImportForm slug={slug} /> : null}
        </section>
      </div>
    </>
  );
}
