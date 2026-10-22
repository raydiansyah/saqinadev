import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { RetryJobButton } from "@/components/memory/bindings-panel";
import { MemoryTabs } from "@/components/memory/memory-tabs";
import { LocalTime } from "@/components/primitives/local-time";
import { AppError } from "@/lib/errors";
import { getOverview, listJobs } from "@/lib/memory/queries";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memoryHub.jobs");
  return { title: t("title"), robots: { index: false } };
}

export default async function MemoryJobsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/memory/jobs">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  // Operational detail is for project admins; everyone else sees the page as not found.
  const jobs = await listJobs(access).catch((error) => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  const [overview, t] = await Promise.all([getOverview(access), getTranslations("memoryHub.jobs")]);

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <MemoryTabs slug={slug} active="jobs" pending={overview.pendingReview} admin />
      {jobs.length === 0 ? (
        <EmptyState title={t("empty")} body={t("description")} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
              <span className="font-medium">{t(`kind.${j.kind}`)}</span>
              <span className="rounded-md border border-border-strong px-2 py-0.5 font-mono text-xs">
                {t(`status.${j.status}`)}
              </span>
              <span className="text-muted-foreground">
                {t("attempts")}: {j.attempts}
              </span>
              {j.errorCode ? (
                <span className="font-mono text-xs text-error">{j.errorCode}</span>
              ) : null}
              <LocalTime
                iso={j.createdAt.toISOString()}
                className="font-mono text-xs text-subtle-foreground"
              />
              {j.status === "failed_permanent" || j.status === "failed_retryable" ? (
                <span className="sm:ml-auto">
                  <RetryJobButton slug={slug} jobId={j.id} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
