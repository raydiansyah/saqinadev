"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AgentView, TaskView } from "@/lib/executions/view";
import { parseReason } from "./reasons";
import { ExecutionStatusBadge } from "./status";

/** One task of the plan: who owns it, what it waits for, how it is going and, if it stopped, why. */
export function TaskRow({
  task,
  tasks,
  agents,
  canRetry,
  retrying,
  onRetry,
}: {
  task: TaskView;
  tasks: TaskView[];
  agents: AgentView[];
  canRetry: boolean;
  retrying: boolean;
  onRetry: (taskId: string) => void;
}) {
  const t = useTranslations("studio.execution");
  const roles = useTranslations("assistant.agents.roles");
  const owner = agents.find((a) => a.id === (task.agentId ?? task.plannedAgentId));
  const waitsFor = task.dependsOn
    .map((id) => tasks.find((x) => x.id === id))
    .filter((x): x is TaskView => Boolean(x) && x?.status !== "succeeded");
  const reason = parseReason(task.blockedReason);
  const retryable = canRetry && (task.status === "failed" || task.status === "blocked");

  return (
    <li className="panel-in rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-sm font-medium text-pretty">{task.title}</p>
        <ExecutionStatusBadge status={task.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {owner ? owner.name : task.roleKey ? roles(task.roleKey as "planner") : t("noOwner")}
        {task.attempts > 1 ? ` · ${t("attempts", { n: task.attempts })}` : ""}
        {task.parentTaskId ? ` · ${t("revision")}` : ""}
      </p>
      {waitsFor.length > 0 && (task.status === "pending" || task.status === "queued") ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("waitsFor", { titles: waitsFor.map((x) => x.title).join(", ") })}
        </p>
      ) : null}
      {reason ? (
        <p role="note" className="mt-2 rounded-sm bg-surface px-2 py-1.5 text-xs">
          {t.has(`reasons.${reason.key}` as never) ? (
            t(`reasons.${reason.key}` as never, reason.values as never)
          ) : (
            <span className="font-mono">{task.blockedReason}</span>
          )}
        </p>
      ) : null}
      {task.acceptanceCriteria.length > 0 ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t("criteria", { n: task.acceptanceCriteria.length })}
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {task.acceptanceCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {retryable ? (
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          disabled={retrying}
          onClick={() => onRetry(task.id)}
        >
          {t("retry")}
        </Button>
      ) : null}
    </li>
  );
}
