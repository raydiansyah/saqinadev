import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/project/activity-list";
import { AgentActivityPanel, AttentionPanel } from "@/components/project/attention-panels";
import { ContextMap } from "@/components/project/context-map";
import { Pipeline } from "@/components/project/pipeline";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listActivity } from "@/lib/activity/service";
import { listRuns } from "@/lib/agents/runs";
import { db } from "@/lib/db/client";
import { projectPageAccess, projectSnapshot } from "@/lib/projects/page";
import { getNextProjectAction, pipelineStages } from "@/lib/projects/progress";
import { contextCounts } from "@/lib/projects/repository";
import { listRecommendations } from "@/lib/recommendations/service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/project/[slug]">): Promise<Metadata> {
  const { project } = await projectPageAccess((await params).slug);
  return { title: project.name, robots: { index: false } };
}

export default async function ProjectOverviewPage({
  params,
}: PageProps<"/[locale]/project/[slug]">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const { project, actor } = access;
  const snapshot = await projectSnapshot(slug);
  const [counts, recs, activity, runs] = await Promise.all([
    contextCounts(db, project.id),
    listRecommendations(access),
    listActivity(project.id, { limit: 5 }),
    listRuns(access, { limit: 5 }),
  ]);
  const t = await getTranslations("project");
  const docs = await getTranslations("documents.statuses");
  const next = getNextProjectAction(snapshot);
  const base = `/project/${slug}`;
  const interviewDone = snapshot.interviewStatus === "completed";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        <section
          aria-labelledby="next-heading"
          className="rounded-lg border border-primary/40 bg-surface p-5"
        >
          <h2 id="next-heading" className="font-mono text-xs text-subtle-foreground">
            {t("overview.nextAction")}
          </h2>
          <p className="mt-1 text-lg font-semibold">{t(`nextActions.${next.kind}`)}</p>
          <p className="mt-1 text-muted-foreground">{t(`nextActionHints.${next.kind}`)}</p>
          <Link href={`${base}${next.path}`} className={buttonVariants({ className: "mt-4" })}>
            {t(`nextActions.${next.kind}`)}
          </Link>
        </section>

        <section aria-labelledby="progress-heading">
          <h2 id="progress-heading" className="mb-3 font-medium">
            {t("overview.progress")}
          </h2>
          <Pipeline stages={pipelineStages(snapshot)} />
        </section>

        {interviewDone ? (
          <section aria-labelledby="context-heading">
            <h2 id="context-heading" className="font-medium">
              {t("overview.context")}
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("overview.contextHint")}</p>
            <ContextMap
              projectName={project.name}
              nodes={[
                {
                  key: "requirements",
                  path: `${base}/requirements`,
                  detail: t("overview.counts.requirements", { count: counts.requirements }),
                },
                {
                  key: "prd",
                  path: `${base}/prd`,
                  detail: snapshot.prdStatus ? docs(snapshot.prdStatus) : "–",
                },
                {
                  key: "plan",
                  path: `${base}/plan`,
                  detail: t("overview.counts.plan", { count: counts.milestones }),
                },
                {
                  key: "tasks",
                  path: `${base}/tasks`,
                  detail: t("overview.counts.tasks", { count: counts.tasks }),
                },
                {
                  key: "memory",
                  path: `${base}/memory`,
                  detail: t("overview.counts.memory", { count: counts.memories }),
                },
                {
                  key: "decisions",
                  path: `${base}/decisions`,
                  detail: t("overview.counts.decisions", { count: counts.decisions }),
                },
              ]}
            />
          </section>
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong p-5 text-muted-foreground">
            {t("overview.interviewPending")}
          </p>
        )}
      </div>

      <aside className="space-y-8">
        <AttentionPanel slug={slug} snapshot={snapshot} />
        <AgentActivityPanel slug={slug} runs={runs} />
        <section aria-labelledby="about-heading">
          <h2 id="about-heading" className="mb-2 font-medium">
            {t("overview.about")}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">{project.description}</p>
        </section>

        {recs.length > 0 ? (
          <section aria-labelledby="approach-heading">
            <h2 id="approach-heading" className="mb-3 font-medium">
              {t("overview.approach")}
            </h2>
            <dl className="space-y-2 text-sm">
              {recs
                .filter((r) => r.key !== "landing")
                .map((r) => (
                  <div
                    key={r.key}
                    className="flex justify-between gap-3 border-b border-border pb-2"
                  >
                    <dt className="text-muted-foreground">{t(`review.recLabels.${r.key}`)}</dt>
                    <dd className="text-right font-medium">{r.value.label}</dd>
                  </div>
                ))}
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="recent-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="recent-heading" className="font-medium">
              {t("overview.recentActivity")}
            </h2>
            <Link
              href={`${base}/activity`}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("overview.allActivity")}
            </Link>
          </div>
          {activity.items.length > 0 ? (
            <ActivityList items={activity.items} viewerName={actor.name} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("overview.noActivity")}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
