import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeading } from "@/components/app/states";
import { MilestoneBlock, type PlanTask } from "@/components/plan/milestone-block";
import { MilestoneEdit } from "@/components/plan/milestone-edit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getDocument } from "@/lib/documents/service";
import { projectPageAccess } from "@/lib/projects/page";
import { listMilestones, listTasks } from "@/lib/tasks/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("plan");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PlanPage({ params }: PageProps<"/[locale]/project/[slug]/plan">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [milestones, tasks, planDoc] = await Promise.all([
    listMilestones(access),
    listTasks(access),
    getDocument(access, "plan"),
  ]);
  const t = await getTranslations("plan");
  const taskT = await getTranslations("tasks");
  const canEdit = can(access.role, "content:write");
  const base = `/project/${slug}`;

  // Group once; tasks pointing at an unknown milestone fall into the unassigned group.
  const byMilestone = new Map<string, PlanTask[]>(milestones.map((m) => [m.id, []]));
  const unassigned: PlanTask[] = [];
  for (const task of tasks) {
    const item = { id: task.id, title: task.title, status: task.status };
    const group = task.milestoneId ? byMilestone.get(task.milestoneId) : undefined;
    if (group) group.push(item);
    else unassigned.push(item);
  }

  const links = (
    <>
      <Link href={`${base}/tasks`} className={buttonVariants({ variant: "outline" })}>
        {t("openTasks")}
      </Link>
      {planDoc ? (
        <Link href={`${base}/documents/plan`} className={buttonVariants({ variant: "ghost" })}>
          {t("openPlanDoc")}
        </Link>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeading title={t("title")} description={t("description")} actions={links} />
      {milestones.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} className="mb-6" />
      ) : (
        <ol className="space-y-6">
          {milestones.map((m, i) => (
            <li key={m.id}>
              <MilestoneBlock
                headingId={`milestone-${m.id}`}
                eyebrow={t("milestone", { n: String(i + 1).padStart(2, "0") })}
                title={m.title}
                goal={m.goal}
                tasks={byMilestone.get(m.id) ?? []}
                actions={
                  canEdit ? (
                    <MilestoneEdit
                      slug={slug}
                      milestone={{ id: m.id, title: m.title, goal: m.goal }}
                    />
                  ) : null
                }
              />
            </li>
          ))}
        </ol>
      )}
      {unassigned.length > 0 ? (
        <div className="mt-6">
          <MilestoneBlock
            headingId="milestone-none"
            title={taskT("fields.noMilestone")}
            tasks={unassigned}
          />
        </div>
      ) : null}
    </>
  );
}
