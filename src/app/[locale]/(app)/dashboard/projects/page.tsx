import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectCard } from "@/components/app/project-card";
import { EmptyState, PageHeading } from "@/components/app/states";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { listProjects } from "@/lib/projects/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: t("projects"), robots: { index: false } };
}

export default async function ProjectsPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/projects">) {
  const actor = await requireActorPage("/dashboard/projects");
  const showArchived = (await searchParams).archived === "1";
  const all = await listProjects(actor, { archived: showArchived });
  const projects = showArchived ? all.filter((p) => p.archived) : all;
  const t = await getTranslations("app");

  return (
    <>
      <PageHeading
        title={t("nav.projects")}
        actions={
          <>
            <Link
              href={showArchived ? "/dashboard/projects" : "/dashboard/projects?archived=1"}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {showArchived ? t("dashboard.hideArchived") : t("dashboard.showArchived")}
            </Link>
            <Link href="/dashboard/new" className={buttonVariants({ size: "sm" })}>
              {t("dashboard.newProject")}
            </Link>
          </>
        }
      />
      {projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      ) : showArchived ? (
        <EmptyState title={t("dashboard.noArchived")} body="" />
      ) : (
        <EmptyState
          title={t("dashboard.noProjectsTitle")}
          body={t("dashboard.noProjectsBody")}
          action={
            <Link href="/dashboard/new" className={buttonVariants()}>
              {t("dashboard.newProject")}
            </Link>
          }
        />
      )}
    </>
  );
}
