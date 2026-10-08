import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TaskBoard } from "@/components/tasks/task-board";
import { can } from "@/lib/auth/permissions";
import { projectPageAccess } from "@/lib/projects/page";
import { listMilestones, listTasks } from "@/lib/tasks/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function TasksPage({ params }: PageProps<"/[locale]/project/[slug]/tasks">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [tasks, milestones] = await Promise.all([listTasks(access), listMilestones(access)]);

  return (
    <TaskBoard
      slug={slug}
      canEdit={can(access.role, "content:write")}
      milestones={milestones.map((m) => ({ id: m.id, title: m.title }))}
      tasks={tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        source: task.source,
        milestoneId: task.milestoneId,
      }))}
    />
  );
}
