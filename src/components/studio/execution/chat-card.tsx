"use client";

import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useOptionalExecutionContext } from "./context";
import { ExecutionStatusBadge } from "./status";
import { useExecution } from "./use-execution";

/**
 * The live card of an execution inside the conversation. The long detail lives in the work area;
 * the chat keeps what is useful at a glance: the state, who is working on what, how far it is.
 * The active execution shares its copy with the tabs, so the card and the tabs can never disagree.
 */
export function ExecutionCard({ slug, executionId }: { slug: string; executionId: string }) {
  const t = useTranslations("studio.execution");
  const ctx = useOptionalExecutionContext();
  const isActive = ctx?.activeId === executionId;
  const own = useExecution(slug, isActive || !ctx ? null : executionId, false);
  const state = isActive && ctx ? ctx.active.state : own.state;
  const execution = state.execution;

  if (!ctx)
    return (
      <div className="rounded-md border border-border p-3 text-sm">
        <p>{t("startedElsewhere")}</p>
        <Link
          href={`/project/${slug}/studio`}
          className={buttonVariants({ size: "sm", variant: "outline", className: "mt-2" })}
        >
          {t("openStudio")}
        </Link>
      </div>
    );
  if (!execution)
    return (
      <p
        className="rounded-md border border-border p-3 text-sm text-muted-foreground"
        role="status"
      >
        {t("loading")}
      </p>
    );

  const working = execution.agents.filter((a) => a.taskTitle && a.status !== "idle");
  return (
    <div className="panel-in space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ExecutionStatusBadge status={execution.status} />
        <span className="text-xs text-muted-foreground">{t(`mode.${execution.mode}`)}</span>
        <span className="ml-auto font-mono text-xs text-subtle-foreground">
          {execution.progress.total > 0
            ? t("progress", { done: execution.progress.done, total: execution.progress.total })
            : t("progressNone")}
        </span>
      </div>
      <p className="text-sm text-pretty">{execution.goal ?? execution.request}</p>
      {working.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {working.slice(0, 4).map((a) => (
            <li key={a.id} className="truncate">
              <span className="font-medium text-foreground">{a.name}</span> —{" "}
              {t(`status.${a.status}` as never)}: {a.taskTitle}
            </li>
          ))}
        </ul>
      ) : null}
      {!isActive ? (
        <Button size="sm" variant="outline" onClick={() => ctx.open(executionId)}>
          {t("openWork")}
        </Button>
      ) : null}
    </div>
  );
}
