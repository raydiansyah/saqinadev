import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app/app-header";
import { AskSaqinaTrigger, CommandCenterProvider } from "@/components/assistant/command-center";
import { CollapsibleSidebar } from "@/components/project/collapsible-sidebar";
import { ProjectDrawer } from "@/components/project/project-drawer";
import { ProjectHeader } from "@/components/project/project-header";
import { ProjectMain } from "@/components/project/project-main";
import { ProjectSidebarNav } from "@/components/project/project-sidebar";
import type { Locale } from "@/i18n/locales";
import { can } from "@/lib/auth/permissions";
import { projectPageAccess, projectSnapshot } from "@/lib/projects/page";
import { getNextProjectAction } from "@/lib/projects/progress";
import { getUiMode } from "@/lib/users/preferences";

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
    mode: await getUiMode(actor),
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
        <CollapsibleSidebar>
          <ProjectSidebarNav project={sidebarProject} />
        </CollapsibleSidebar>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <ProjectMain slug={slug}>
            <ProjectHeader project={project} next={getNextProjectAction(snapshot)} />
            <div className="pt-8">{children}</div>
          </ProjectMain>
        </main>
      </div>
    </CommandCenterProvider>
  );
}
