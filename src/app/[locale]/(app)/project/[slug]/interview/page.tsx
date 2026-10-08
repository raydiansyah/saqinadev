import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectInterview } from "@/components/project-interview/project-interview";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/locales";
import { isLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { getInterviewState } from "@/lib/interviews/service";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("project.interview");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function InterviewPage({
  params,
}: PageProps<"/[locale]/project/[slug]/interview">) {
  const { slug } = await params;
  const { actor, project } = await projectPageAccess(slug);
  const state = await getInterviewState(actor, slug);
  const t = await getTranslations("project.interview");
  // Documents follow the project's language, so the interview does too.
  const locale: Locale = isLocale(project.locale) ? project.locale : "en";

  if (state.status === "completed") {
    return (
      <div className="max-w-xl">
        <p className="text-muted-foreground">{t("completed")}</p>
        <Link
          href={`/project/${slug}/requirements`}
          className={buttonVariants({ className: "mt-6" })}
        >
          {t("openRequirements")}
        </Link>
      </div>
    );
  }

  return (
    <ProjectInterview
      slug={slug}
      locale={locale}
      initialData={state.data}
      initialStep={state.step}
    />
  );
}
