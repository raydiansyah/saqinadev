import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Greeting } from "@/components/app/greeting";
import { ProjectCard } from "@/components/app/project-card";
import { DashboardFinance } from "@/components/finance/finance-summary";
import { buttonVariants } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { isClientUser } from "@/lib/portal/access";
import { listProjects } from "@/lib/projects/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.dashboard");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Next actions that mean something is waiting on the user. */
const NEEDS_ATTENTION = new Set([
  "resolveBlocker",
  "resolveConflicts",
  "resolveOpenQuestions",
  "reviewWork",
]);

export default async function DashboardPage() {
  const actor = await requireActorPage("/dashboard");
  const projects = await listProjects(actor);
  // Portal-only users (client contacts without projects of their own) belong in the portal.
  if (projects.length === 0 && (await isClientUser(actor)))
    redirect({ href: "/portal", locale: await getLocale() });
  const t = await getTranslations("app");
  const firstName = actor.name.split(/\s+/)[0] ?? actor.name;

  // New user: a focused welcome instead of an empty dashboard.
  if (projects.length === 0) {
    return (
      <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
        <p className="font-mono text-xs text-subtle-foreground">{t("onboarding.title")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
          {t("onboarding.question")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("onboarding.body")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard/new" className={buttonVariants({ size: "lg" })}>
            {t("onboarding.start")}
          </Link>
          <Link
            href="/dashboard/projects"
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            {t("onboarding.explore")}
          </Link>
        </div>
      </section>
    );
  }

  const unfinished = projects.find((p) => p.snapshot.interviewStatus !== "completed");
  const attention = projects.filter((p) => NEEDS_ATTENTION.has(p.nextAction.kind));

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Greeting name={firstName} />
          <p className="mt-1 text-muted-foreground">{t("dashboard.continue")}</p>
        </div>
        <Link href="/dashboard/new" className={buttonVariants({ size: "sm" })}>
          {t("dashboard.newProject")}
        </Link>
      </div>

      <DashboardFinance actor={actor} />

      {unfinished ? (
        <section
          aria-labelledby="resume-heading"
          className="rounded-lg border border-primary/40 bg-surface p-5"
        >
          <h2 id="resume-heading" className="font-semibold">
            {t("onboarding.resumeTitle")}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {t("onboarding.resumeBody", { name: unfinished.name })}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`/project/${unfinished.slug}/interview`} className={buttonVariants()}>
              {t("onboarding.resume")}
            </Link>
            <Link href="/dashboard/new" className={buttonVariants({ variant: "outline" })}>
              {t("onboarding.startNew")}
            </Link>
          </div>
        </section>
      ) : null}

      {attention.length > 0 ? (
        <section aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="mb-4 font-medium">
            {t("dashboard.attention")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {attention.slice(0, 4).map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="recent-heading">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="recent-heading" className="font-medium">
            {t("dashboard.recent")}
          </h2>
          <Link
            href="/dashboard/projects"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("dashboard.allProjects")}
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {projects
            .filter((p) => !attention.includes(p))
            .slice(0, 6)
            .map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
        </div>
      </section>
    </div>
  );
}
