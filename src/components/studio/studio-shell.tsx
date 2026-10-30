"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { startExecutionAction } from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import { Chat } from "@/components/assistant/chat";
import { PROJECT_CONTEXT } from "@/components/assistant/types";
import { useAssistant } from "@/components/assistant/use-assistant";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { DeploymentView, DeployTargetView } from "@/lib/deploy/service";
import type { RunStatus, TaskStatus } from "@/lib/domain/enums";
import type { ServicesState } from "@/lib/services/service";
import type { GitState } from "@/lib/studio/git-state";
import { cn } from "@/lib/utils";
import { ExecutionAgents } from "./execution/agents-tab";
import {
  type ExecutionListItem,
  ExecutionProvider,
  useExecutionContext,
} from "./execution/context";
import { ExecutionCode } from "./execution/execution-code";
import { ExecutionGit } from "./execution/execution-git";
import { ExecutionPreview } from "./execution/execution-preview";
import { ExecutionPicker } from "./execution/picker";
import { ExecutionPlan } from "./execution/plan-tab";
import { PublishStages } from "./execution/publish-stages";
import { AgentsTab, PlanTab } from "./legacy-tabs";
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

type Props = {
  slug: string;
  canWrite: boolean;
  buildsInSaqina: boolean;
  prdApproved: boolean;
  plan: StudioPlan;
  runs: StudioRun[];
  git: GitState;
  deploy: { target: DeployTargetView; deployments: DeploymentView[] };
  services: ServicesState;
  canManage: boolean;
  executions: ExecutionListItem[];
  initial?: Parameters<typeof useAssistant>[1];
};

/**
 * The Studio: the conversation on one side, the work area on the other. When a reply makes a
 * plan or starts agents, the work area turns to that tab by itself. Below `lg` the two panes are
 * one switch apart instead of side by side. Every tab and the card in the chat read the same
 * execution, so they show the same state.
 */
export function StudioShell(props: Props) {
  const [tab, setTab] = useState<Tab>(
    props.executions.length > 0 || props.runs.length > 0 ? "agents" : "plan",
  );
  const [pane, setPane] = useState<"chat" | "work">("chat");
  const [badge, setBadge] = useState(false);
  return (
    <ExecutionProvider
      slug={props.slug}
      list={props.executions}
      onOpen={() => {
        setTab("agents");
        setPane("work");
      }}
    >
      <StudioBody
        {...props}
        tab={tab}
        setTab={setTab}
        pane={pane}
        setPane={setPane}
        badge={badge}
        setBadge={setBadge}
      />
    </ExecutionProvider>
  );
}

function StudioBody({
  slug,
  canWrite,
  buildsInSaqina,
  prdApproved,
  plan,
  runs,
  git,
  deploy,
  services,
  canManage,
  initial,
  tab,
  setTab,
  pane,
  setPane,
  badge,
  setBadge,
}: Props & {
  tab: Tab;
  setTab: (tab: Tab) => void;
  pane: "chat" | "work";
  setPane: (pane: "chat" | "work") => void;
  badge: boolean;
  setBadge: (badge: boolean) => void;
}) {
  const t = useTranslations("studio");
  const te = useTranslations("studio.execution");
  const app = useTranslations("app.errors");
  const id = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [startError, setStartError] = useState<string | null>(null);
  // The preview frame is kept once it has been opened, so switching tabs does not reload the site.
  const [seenPreview, setSeenPreview] = useState(false);
  useEffect(() => {
    if (tab === "preview") setSeenPreview(true);
  }, [tab]);
  const exec = useExecutionContext();
  const chat = useAssistant(slug, initial, {
    onFocus: (target) => {
      setTab(target);
      // On a phone the person is reading the chat: mark the work pane instead of jumping.
      setBadge(true);
    },
  });
  const execution = exec.active.state.execution;
  const building =
    execution?.mode === "build" && !["succeeded", "failed", "cancelled"].includes(execution.status);

  /** Plan or Build from the composer: start it, show it in the chat, and turn the work area to it. */
  const execute = async (mode: "plan" | "build", text: string) => {
    setStartError(null);
    const result = await startExecutionAction(slug, {
      mode,
      request: text,
      conversationId: chat.conversationId,
    });
    if (!result.ok) {
      setStartError(result.code);
      return false;
    }
    exec.register({
      id: result.data.id,
      mode,
      status: "queued",
      request: text,
      createdAt: new Date().toISOString(),
    });
    setTab(mode === "build" ? "agents" : "plan");
    setBadge(true);
    if (result.data.conversationId) await chat.load(result.data.conversationId);
    return true;
  };

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
      {startError ? (
        <Notice tone="error" className="mb-4">
          {te.has(`startErrors.${startError}` as never)
            ? te(`startErrors.${startError}` as never)
            : app.has(startError as never)
              ? app(startError as never)
              : app("INTERNAL_ERROR")}
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

      <div
        className={cn(
          "grid gap-4 transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none",
          // While agents build, the work area takes more room; the chat stays in view beside it.
          building ? "lg:grid-cols-[5fr_9fr]" : "lg:grid-cols-[2fr_3fr]",
        )}
      >
        <section
          aria-label={t("pane.chat")}
          className={cn(
            "h-[calc(100dvh-16rem)] min-h-[26rem] min-w-0 flex-col overflow-hidden rounded-md border border-border",
            pane === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
          <Chat
            slug={slug}
            chat={chat}
            context={PROJECT_CONTEXT}
            canWrite={canWrite}
            execute={buildsInSaqina || canWrite ? execute : undefined}
          />
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
            {exec.activeId && seenPreview ? (
              <div hidden={tab !== "preview"}>
                <ExecutionPreview />
              </div>
            ) : null}
            <div key={tab} className="panel-in">
              {tab === "plan" ? (
                exec.activeId ? (
                  <>
                    <ExecutionPicker />
                    <ExecutionState canWrite={canWrite}>
                      <ExecutionPlan canWrite={canWrite} />
                    </ExecutionState>
                  </>
                ) : (
                  <PlanTab slug={slug} plan={plan} />
                )
              ) : null}
              {tab === "agents" ? (
                exec.activeId ? (
                  <>
                    <ExecutionPicker />
                    <ExecutionState canWrite={canWrite}>
                      <ExecutionAgents canWrite={canWrite} />
                    </ExecutionState>
                    {runs.length > 0 ? (
                      <details className="mt-6">
                        <summary className="cursor-pointer text-sm text-muted-foreground">
                          {te("otherRuns")}
                        </summary>
                        <div className="mt-3">
                          <AgentsTab slug={slug} runs={runs} buildsInSaqina={buildsInSaqina} />
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <AgentsTab slug={slug} runs={runs} buildsInSaqina={buildsInSaqina} />
                )
              ) : null}
              {tab === "code" ? (
                <>
                  {exec.activeId ? <ExecutionCode /> : null}
                  <CodeTab slug={slug} repository={git.repository?.fullName ?? null} />
                </>
              ) : null}
              {tab === "git" ? (
                <>
                  {exec.activeId ? <ExecutionGit /> : null}
                  <GitTab slug={slug} git={git} canManage={canManage} />
                </>
              ) : null}
              {tab === "preview" ? (
                exec.activeId ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      {te("preview.published")}
                    </summary>
                    <div className="mt-3">
                      <PreviewTab
                        deployments={deploy.deployments}
                        services={services}
                        onPublish={() => setTab("publish")}
                      />
                    </div>
                  </details>
                ) : (
                  <PreviewTab
                    deployments={deploy.deployments}
                    services={services}
                    onPublish={() => setTab("publish")}
                  />
                )
              ) : null}
              {tab === "publish" ? (
                <>
                  {exec.activeId ? <PublishStages /> : null}
                  <PublishTab
                    slug={slug}
                    target={deploy.target}
                    deployments={deploy.deployments}
                    services={services}
                    canManage={canManage}
                  />
                </>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Says what is happening while the execution loads, and when it cannot be shown. */
function ExecutionState({ children }: { canWrite: boolean; children: React.ReactNode }) {
  const t = useTranslations("studio.execution");
  const { active } = useExecutionContext();
  if (active.error === "gone") return <Notice tone="error">{t("gone")}</Notice>;
  if (active.error === "failed" && !active.state.execution)
    return (
      <div className="space-y-2">
        <Notice tone="error">{t("loadFailed")}</Notice>
        <Button size="sm" variant="outline" onClick={() => void active.refetch()}>
          {t("tryAgain")}
        </Button>
      </div>
    );
  if (active.loading)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  return <>{children}</>;
}
