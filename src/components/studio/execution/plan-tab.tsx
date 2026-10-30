"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/form";
import { levels } from "@/lib/executions/graph";
import { useExecutionContext } from "./context";
import { TaskRow } from "./task-row";
import { ExecutionToolbar } from "./toolbar";
import { useExecutionActions } from "./use-actions";

/** The plan of the active execution: goal, risks and the tasks by step, each with its owner and state. */
export function ExecutionPlan({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations("studio.execution");
  const id = useId();
  const { slug, active } = useExecutionContext();
  const execution = active.state.execution;
  const [revising, setRevising] = useState(false);
  const actions = useExecutionActions(slug, execution?.id ?? "", active.refetch);
  if (!execution) return null;

  const tasks = execution.tasks.filter(
    (x) => x.phase !== "plan" && x.planVersion === execution.planVersion,
  );
  const rows = levels(
    tasks.map((x) => ({
      key: x.id,
      dependsOn: x.dependsOn.filter((d) => tasks.some((y) => y.id === d)),
    })),
  );
  const steps = rows.map((keys) => keys.flatMap((k) => tasks.find((x) => x.id === k) ?? []));

  return (
    <div className="space-y-5">
      <ExecutionToolbar
        execution={execution}
        connection={active.state.connection}
        canWrite={canWrite}
        actions={actions}
      />
      <div>
        <h3 className="text-xs font-mono uppercase tracking-wider text-subtle-foreground">
          {t("goal")}
        </h3>
        <p className="mt-1 text-sm text-pretty">{execution.goal ?? execution.request}</p>
        {execution.risks.length > 0 ? (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {t("risks", { n: execution.risks.length })}
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {execution.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {execution.status === "failed" ? t("noTasksFailed") : t("planning")}
        </p>
      ) : (
        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li key={step[0]?.id ?? i}>
              <h3 className="mb-1.5 font-mono text-xs uppercase tracking-wider text-subtle-foreground">
                {t("step", { n: i + 1 })}
              </h3>
              <ul className="space-y-2">
                {step.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    tasks={execution.tasks}
                    agents={execution.agents}
                    canRetry={canWrite && !actions.pending}
                    retrying={actions.pending}
                    onRetry={actions.retry}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {canWrite && execution.status === "planned" ? (
        revising ? (
          <form
            className="space-y-2"
            action={(form) =>
              actions.revise(String(form.get("request") ?? ""), () => setRevising(false))
            }
          >
            <TextArea
              id={`${id}-revise`}
              name="request"
              label={t("reviseLabel")}
              hint={t("reviseHint")}
              rows={3}
              defaultValue={execution.request}
              maxLength={4000}
              required
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={actions.pending}>
                {t("reviseSubmit")}
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setRevising(false)}>
                {t("reviseCancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setRevising(true)}>
            {t("revise")}
          </Button>
        )
      ) : null}
    </div>
  );
}
