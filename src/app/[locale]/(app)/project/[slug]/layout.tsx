import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app/app-header";
import { AskSaqinaTrigger, CommandCenterProvider } from "@/components/assistant/command-center";
import { ProjectDrawer } from "@/components/project/project-drawer";
import { ProjectHeader } from "@/components/project/project-header";
import { ProjectSidebarNav } from "@/components/project/project-sidebar";
import type { Locale } from "@/i18n/locales";
import { can } from "@/lib/auth/permissions";
import { projectPageAccess, projectSnapshot } from "@/lib/projects/page";
import { getNextProjectAction } from "@/lib/projects/progress";

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/[locale]/project/[slug]">) {
  const { slug, locale } = (await params) as { slug: string; locale: Locale };
  const { project, actor, role } = await projectPageAccess(slug);
  const snapshot = await projectSnapshot(slug);
  const t = await getTranslations("project.statuses");
  const sidebarProject = {
    slug,
    name: project.name,
    statusLabel: t(project.status),
    pendingApprovals: snapshot.attention?.pendingProposals ?? 0,
  };

  return (
    <CommandCenterProvider
      slug={slug}
      projectName={project.name}
      canWrite={can(role, "content:write")}
    >
      <AppHeader
        actor={actor}
        locale={locale}
        leading={<ProjectDrawer project={sidebarProject} />}
        trailing={<AskSaqinaTrigger />}
      />
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 border-r border-border pt-4 lg:block">
          <ProjectSidebarNav project={sidebarProject} />
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <ProjectHeader project={project} next={getNextProjectAction(snapshot)} />
            <div className="pt-8">{children}</div>
          </div>
        </main>
      </div>
    </CommandCenterProvider>
  );
}
