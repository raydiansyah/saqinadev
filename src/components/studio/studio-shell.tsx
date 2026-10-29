"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { RunStatusChip } from "@/components/assistant/blocks/run-card";
import { Chat } from "@/components/assistant/chat";
import { PROJECT_CONTEXT } from "@/components/assistant/types";
import { useAssistant } from "@/components/assistant/use-assistant";
import { MilestoneBlock, type PlanTask } from "@/components/plan/milestone-block";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { DeploymentView, DeployTargetView } from "@/lib/deploy/service";
import type { RunStatus, TaskStatus } from "@/lib/domain/enums";
import { formatRelative } from "@/lib/format";
import type { GitState } from "@/lib/studio/git-state";
import { cn } from "@/lib/utils";
import { CodeTab, GitTab, PreviewTab, PublishTab } from "./work-tabs";

const TABS = ["plan", "agents", "code", "git", "preview", "publish"] as const;
type Tab = (typeof TABS)[number];

export interface StudioPlan {
  milestones: { id: string; title: string; goal: string }[];
  tasks: { id: string; title: string; status: TaskStatus; milestoneId: string | null }[];
}

export interface StudioRun {
  id: string;
  status: RunStatus;
  agentName: string;
  taskTitle: string | null;
  createdAt: string;
}

/**
 * The Studio: the conversation on one side, the work area on the other. When a reply makes a
 * plan or starts agents, the work area turns to that tab by itself. Below `lg` the two panes are
 * one switch apart instead of side by side.
 */
export function StudioShell({
  slug,
  canWrite,
  buildsInSaqina,
  prdApproved,
  plan,
  runs,
  git,
  deploy,
  canManage,
  initial,
}: {
  slug: string;
  canWrite: boolean;
  buildsInSaqina: boolean;
  prdApproved: boolean;
  plan: StudioPlan;
  runs: StudioRun[];
  git: GitState;
  deploy: { target: DeployTargetView; deployments: DeploymentView[] };
  canManage: boolean;
  initial?: Parameters<typeof useAssistant>[1];
}) {
  const t = useTranslations("studio");
  const id = useId();
  const [tab, setTab] = useState<Tab>(runs.length > 0 ? "agents" : "plan");
  const [pane, setPane] = useState<"chat" | "work">("chat");
  const [badge, setBadge] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const chat = useAssistant(slug, initial, {
    onFocus: (target) => {
      setTab(target);
      // On a phone the person is reading the chat: mark the work pane instead of jumping.
      setBadge(true);
    },
  });

  const usable = TABS;
  const onKey = (e: React.KeyboardEvent) => {
    const i = usable.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? usable[(i + 1) % usable.length]
        : e.key === "ArrowLeft"
          ? usable[(i - 1 + usable.length) % usable.length]
          : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <h1 className="sr-only">{t("title")}</h1>
      {!prdApproved ? (
        <Notice tone="info" className="mb-4">
          {t("prdNotApproved")}{" "}
          <Link href={`/project/${slug}/prd`} className="underline underline-offset-2">
            {t("openPrd")}
          </Link>
        </Notice>
      ) : null}

      <div
        role="group"
        aria-label={t("panes")}
        className="mb-3 grid grid-cols-2 gap-1 rounded-md border border-border p-1 lg:hidden"
      >
        {(["chat", "work"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pane === p}
            onClick={() => {
              setPane(p);
              if (p === "work") setBadge(false);
            }}
            className={cn(
              "relative min-h-11 rounded text-sm",
              pane === p ? "bg-surface-raised font-medium" : "text-muted-foreground",
            )}
          >
            {t(`pane.${p}`)}
            {p === "work" && badge && pane !== "work" ? (
              <span
                className="ml-2 inline-block size-2 rounded-full bg-primary"
                aria-hidden="true"
              />
            ) : null}
            {p === "work" && badge && pane !== "work" ? (
              <span className="sr-only">{t("updated")}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          aria-label={t("pane.chat")}
          className={cn(
            "h-[calc(100dvh-16rem)] min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-md border border-border",
            pane === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
          <Chat slug={slug} chat={chat} context={PROJECT_CONTEXT} canWrite={canWrite} />
        </section>

        <section
          aria-label={t("pane.work")}
          className={cn(
            "h-[calc(100dvh-16rem)] min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-md border border-border",
            pane === "work" ? "flex" : "hidden lg:flex",
          )}
        >
          <div
            role="tablist"
            aria-label={t("pane.work")}
            onKeyDown={onKey}
            className="flex gap-1 overflow-x-auto border-b border-border px-2 pt-2"
          >
            {TABS.map((x) => {
              return (
                <button
                  key={x}
                  ref={(el) => {
                    tabRefs.current[x] = el;
                  }}
                  id={`${id}-tab-${x}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === x}
                  aria-controls={`${id}-panel`}
                  tabIndex={tab === x ? 0 : -1}
                  onClick={() => setTab(x)}
                  className={cn(
                    "min-h-11 shrink-0 rounded-t-md border-b-2 px-3 text-sm whitespace-nowrap",
                    tab === x
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`tabs.${x}`)}
                </button>
              );
            })}
          </div>
          <div
            id={`${id}-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${tab}`}
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {tab === "plan" ? <PlanTab slug={slug} plan={plan} /> : null}
            {tab === "code" ? (
              <CodeTab slug={slug} repository={git.repository?.fullName ?? null} />
            ) : null}
            {tab === "git" ? <GitTab slug={slug} git={git} canManage={canManage} /> : null}
            {tab === "preview" ? (
              <PreviewTab deployments={deploy.deployments} onPublish={() => setTab("publish")} />
            ) : null}
            {tab === "publish" ? (
              <PublishTab
                slug={slug}
                target={deploy.target}
                deployments={deploy.deployments}
                canManage={canManage}
              />
            ) : null}
            {tab === "agents" ? (
              <AgentsTab slug={slug} runs={runs} buildsInSaqina={buildsInSaqina} />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function PlanTab({ slug, plan }: { slug: string; plan: StudioPlan }) {
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

function AgentsTab({
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
