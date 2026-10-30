"use client";

import { useTranslations } from "next-intl";
import { ActivityList } from "./activity";
import { useExecutionContext } from "./context";
import { parseReason } from "./reasons";
import { ExecutionStatusBadge } from "./status";
import { ExecutionToolbar } from "./toolbar";
import { useExecutionActions } from "./use-actions";

/**
 * The agents of the active execution: what each one is doing right now, what it waits for, and
 * what the agents told each other. Every status comes from the tasks on the server.
 */
export function ExecutionAgents({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations("studio.execution");
  const roles = useTranslations("assistant.agents.roles");
  const { slug, active } = useExecutionContext();
  const execution = active.state.execution;
  const actions = useExecutionActions(slug, execution?.id ?? "", active.refetch);
  if (!execution) return null;

  const name = (id: string | null) =>
    execution.agents.find((a) => a.id === id)?.name ?? t("orchestrator");
  const blocked = execution.tasks.filter((x) => x.status === "blocked" || x.status === "failed");
  const handoffs = execution.messages.filter(
    (m) => m.type !== "completion" && m.type !== "assignment",
  );

  return (
    <div className="space-y-5">
      <ExecutionToolbar
        execution={execution}
        connection={active.state.connection}
        canWrite={canWrite}
        actions={actions}
      />

      <section aria-labelledby="exec-agents-title">
        <h3
          id="exec-agents-title"
          className="mb-2 font-mono text-xs uppercase tracking-wider text-subtle-foreground"
        >
          {t("agents")}
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {execution.agents.map((agent) => {
            const waitingTask = execution.tasks.find(
              (x) => x.agentId === agent.id || x.plannedAgentId === agent.id,
            );
            return (
              <li key={agent.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {roles(agent.role as "planner")}
                    </p>
                  </div>
                  <ExecutionStatusBadge status={agent.status} />
                </div>
                <p className="mt-2 min-h-4 text-xs text-muted-foreground text-pretty">
                  {agent.taskTitle ??
                    (agent.status === "idle" ? t("agentIdle") : (waitingTask?.title ?? ""))}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {blocked.length > 0 ? (
        <section aria-labelledby="exec-blockers-title">
          <h3
            id="exec-blockers-title"
            className="mb-2 font-mono text-xs uppercase tracking-wider text-subtle-foreground"
          >
            {t("blockers")}
          </h3>
          <ul className="space-y-2">
            {blocked.map((task) => {
              const reason = parseReason(task.blockedReason);
              return (
                <li key={task.id} className="rounded-md border border-warning/40 p-3 text-sm">
                  <p className="font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reason && t.has(`reasons.${reason.key}` as never)
                      ? t(`reasons.${reason.key}` as never, reason.values as never)
                      : (task.blockedReason ?? "")}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="exec-handoffs-title">
        <h3
          id="exec-handoffs-title"
          className="mb-2 font-mono text-xs uppercase tracking-wider text-subtle-foreground"
        >
          {t("handoffs")}
        </h3>
        {handoffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHandoffs")}</p>
        ) : (
          <ul className="space-y-2">
            {handoffs.slice(-20).map((m) => (
              <li key={m.id} className="rounded-md border border-border p-2.5 text-xs">
                <p className="text-muted-foreground">
                  {name(m.fromAgentId)} → {m.toAgentId ? name(m.toAgentId) : t("everyone")} ·{" "}
                  {t(`messageTypes.${m.type}` as never)}
                </p>
                <p className="mt-1 text-pretty">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exec-activity-title">
        <h3
          id="exec-activity-title"
          className="mb-2 font-mono text-xs uppercase tracking-wider text-subtle-foreground"
        >
          {t("activity")}
        </h3>
        <ActivityList execution={execution} events={active.state.events} />
      </section>
    </div>
  );
}
