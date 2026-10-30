"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EventDTO, ExecutionDTO } from "@/lib/executions/dto";

const PAGE = 30;

/** Events that are worth a line in the activity list. The rest (status pings) stay in the log. */
const SHOWN = new Set([
  "execution.created",
  "execution.started",
  "execution.completed",
  "execution.failed",
  "execution.cancelled",
  "task.created",
  "task.started",
  "task.completed",
  "task.failed",
  "task.blocked",
  "task.cancelled",
  "agent.message_created",
  "agent.handoff_created",
  "artifact.created",
  "git.operation_completed",
  "preview.build_started",
  "preview.updated",
  "preview.failed",
  "approval.required",
  "approval.completed",
]);

/**
 * What happened, in order, newest last. Built only from the stored events: the list is a view of
 * the log, so it reads the same after a reload and cannot invent a step. Long histories are paged.
 */
export function ActivityList({
  execution,
  events,
}: {
  execution: ExecutionDTO;
  events: EventDTO[];
}) {
  const t = useTranslations("studio.execution");
  const locale = useLocale();
  const [shown, setShown] = useState(PAGE);
  const rows = events.filter((e) => SHOWN.has(e.type));
  const visible = rows.slice(-shown);
  const task = (id: unknown) => execution.tasks.find((x) => x.id === id)?.title ?? "";
  const agent = (id: unknown) => execution.agents.find((x) => x.id === id)?.name ?? "";

  const line = (e: EventDTO) => {
    const p = e.payload;
    const values = {
      task: task(p.taskId),
      agent: agent(p.agentId ?? p.from),
      to: agent(p.to),
      title: String(p.title ?? ""),
      path: String(p.path ?? ""),
      sha: String(p.commitSha ?? "").slice(0, 7),
      reason: String(p.reason ?? ""),
      kind: String(p.messageType ?? p.type ?? ""),
    };
    // The event name is a path into the messages (`task.started` is `events.task.started`).
    const say = t as unknown as (key: string, values: Record<string, string>) => string;
    return t.has(`events.${e.type}` as never) ? say(`events.${e.type}`, values) : e.type;
  };

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("noActivity")}</p>;
  return (
    <div>
      {rows.length > visible.length ? (
        <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
          {t("showEarlier", { n: rows.length - visible.length })}
        </Button>
      ) : null}
      <ol aria-label={t("activity")} className="space-y-1.5">
        {visible.map((e) => (
          <li key={e.seq} className="flex gap-2 text-xs">
            <time dateTime={e.createdAt} className="w-14 shrink-0 font-mono text-subtle-foreground">
              {new Date(e.createdAt).toLocaleTimeString(locale, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
            <span className="min-w-0 text-pretty">{line(e)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
