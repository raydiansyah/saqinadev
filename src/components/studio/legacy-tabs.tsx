"use client";

import { useLocale, useTranslations } from "next-intl";
import { RunStatusChip } from "@/components/assistant/blocks/run-card";
import { MilestoneBlock, type PlanTask } from "@/components/plan/milestone-block";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import type { StudioPlan, StudioRun } from "./studio-shell";

/** The plan and the agent runs as they were before executions: milestones, tasks and run history. */
export function PlanTab({ slug, plan }: { slug: string; plan: StudioPlan }) {
  const t = useTranslations("studio");
  const tp = useTranslations("plan");
  const tt = useTranslations("tasks");
  if (plan.milestones.length === 0 && plan.tasks.length === 0)
    return (
      <div className="text-sm text-muted-foreground">
        <p>{t("planEmpty")}</p>
      </div>
    );
  const byMilestone = new Map<string, PlanTask[]>(plan.milestones.map((m) => [m.id, []]));
  const unassigned: PlanTask[] = [];
  for (const task of plan.tasks) {
    const item = { id: task.id, title: task.title, status: task.status };
    const group = task.milestoneId ? byMilestone.get(task.milestoneId) : undefined;
    if (group) group.push(item);
    else unassigned.push(item);
  }
  return (
    <div className="space-y-5">
      <ol className="space-y-5">
        {plan.milestones.map((m, i) => (
          <li key={m.id}>
            <MilestoneBlock
              headingId={`studio-milestone-${m.id}`}
              eyebrow={tp("milestone", { n: String(i + 1).padStart(2, "0") })}
              title={m.title}
              goal={m.goal}
              tasks={byMilestone.get(m.id) ?? []}
            />
          </li>
        ))}
      </ol>
      {unassigned.length > 0 ? (
        <MilestoneBlock
          headingId="studio-milestone-none"
          title={tt("fields.noMilestone")}
          tasks={unassigned}
        />
      ) : null}
      <Link
        href={`/project/${slug}/plan`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {t("openPlan")}
      </Link>
    </div>
  );
}

export function AgentsTab({
  slug,
  runs,
  buildsInSaqina,
}: {
  slug: string;
  runs: StudioRun[];
  buildsInSaqina: boolean;
}) {
  const t = useTranslations("studio");
  const locale = useLocale();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {buildsInSaqina ? t("agentsHint") : t("agentsManual")}
      </p>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRuns")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/project/${slug}/agents/runs/${run.id}`}
                className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-surface"
              >
                <span className="text-sm font-medium">{run.agentName}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {run.taskTitle ?? t("noTask")}
                </span>
                <RunStatusChip status={run.status} />
                <span className="font-mono text-xs text-subtle-foreground">
                  {formatRelative(new Date(run.createdAt), locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/project/${slug}/approvals`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {t("openApprovals")}
      </Link>
    </div>
  );
}
