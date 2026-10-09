import type { Metadata } from "next";
import { StageBadge } from "@/components/portal/progress";
import { ProjectTabs } from "@/components/portal/project-tabs";
import { portalProjectView } from "../../access";

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]/portal/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const view = await portalProjectView(slug);
  return { title: { default: view.name, template: `%s · ${view.name}` }, robots: { index: false } };
}

export default async function PortalProjectLayout({
  children,
  params,
}: LayoutProps<"/[locale]/portal/projects/[slug]">) {
  const { slug } = await params;
  const view = await portalProjectView(slug);
  return (
    <div>
      <div className="mb-6 print:hidden">
        <p className="text-sm break-words text-muted-foreground">{view.clientName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{view.name}</h1>
          <StageBadge stage={view.stage} />
        </div>
      </div>
      <ProjectTabs slug={slug} />
      <div className="pt-8 print:pt-0">{children}</div>
    </div>
  );
}
