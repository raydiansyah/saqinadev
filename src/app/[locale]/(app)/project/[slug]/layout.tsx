import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app/app-header";
import { CollapsibleSidebar } from "@/components/project/collapsible-sidebar";
import { ProjectDrawer } from "@/components/project/project-drawer";
import { ProjectHeader } from "@/components/project/project-header";
import { ProjectMain } from "@/components/project/project-main";
import { ProjectSidebarNav } from "@/components/project/project-sidebar";
import { isPlatformOwner } from "@/lib/platform/roles";
import { projectPageAccess } from "@/lib/projects/page";

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/[locale]/project/[slug]">) {
  const { slug } = await params;
  const { project, actor } = await projectPageAccess(slug);
  // The header's role lookup is started now so it is already answered when the header renders.
  void isPlatformOwner(actor);
  const t = await getTranslations("project.statuses");
  const sidebarProject = { slug, name: project.name, statusLabel: t(project.status) };

  return (
    <>
      <AppHeader actor={actor} leading={<ProjectDrawer project={sidebarProject} />} />
      <div className="flex flex-1">
        <CollapsibleSidebar>
          <ProjectSidebarNav project={sidebarProject} />
        </CollapsibleSidebar>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <ProjectMain>
            <ProjectHeader project={project} />
            <div className="pt-8">{children}</div>
          </ProjectMain>
        </main>
      </div>
    </>
  );
}
