import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { MilestoneEditor } from "@/components/progress/milestone-editor";
import { ProgressView } from "@/components/progress/progress-view";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { milestones, tasks } from "@/lib/db/schema";
import { clientProgress } from "@/lib/portal/progress";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ProgressPage({
  params,
}: PageProps<"/[locale]/project/[slug]/progress">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const projectId = access.project.id;
  const [stages, taskRows, t] = await Promise.all([
    db
      .select({
        id: milestones.id,
        title: milestones.title,
        clientTitle: milestones.clientTitle,
        clientVisible: milestones.clientVisible,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.position), asc(milestones.createdAt)),
    db
      .select({ milestoneId: tasks.milestoneId, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.projectId, projectId)),
    getTranslations("progress"),
  ]);
  const progress = clientProgress(stages, taskRows);

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <div className="max-w-3xl space-y-6">
        <ProgressView progress={progress} />
        {can(access.role, "project:update") && stages.length > 0 ? (
          <MilestoneEditor slug={slug} milestones={stages} />
        ) : null}
      </div>
    </>
  );
}
