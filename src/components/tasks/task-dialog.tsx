"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  createTaskAction,
  updateTaskAction,
} from "@/app/[locale]/(app)/project/[slug]/tasks/actions";
import { Dialog } from "@/components/app/dialog";
import { RunStatusChip } from "@/components/assistant/blocks/run-card";
import { AskSaqinaButton } from "@/components/assistant/command-center";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { PRIORITIES, TASK_STATUSES } from "@/lib/domain/enums";
import { AssignAgent } from "./assign-agent";
import type { MilestoneOption, TaskDraft, TaskRun } from "./types";

/** Create or edit one task. The server validates again; this only catches the obvious. */
export function TaskDialog({
  slug,
  initial,
  milestones,
  canEdit = true,
  run = null,
  onClose,
}: {
  slug: string;
  initial: TaskDraft | null;
  milestones: MilestoneOption[];
  canEdit?: boolean;
  /** The task's open agent run, if any. */
  run?: TaskRun | null;
  onClose: () => void;
}) {
  const t = useTranslations("tasks");
  const priorities = useTranslations("requirements.priorities");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string>();

  if (!initial) return null;

  function onSubmit(form: FormData) {
    const milestone = String(form.get("milestoneId") ?? "");
    const values = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      priority: String(form.get("priority")),
      status: String(form.get("status")),
      milestoneId: milestone === "" ? null : milestone,
    };
    if (values.title.length < 2) {
      setTitleError(errors("VALIDATION_ERROR"));
      return;
    }
    setTitleError(undefined);
    setError(null);
    startTransition(async () => {
      const result = initial?.id
        ? await updateTaskAction(slug, { id: initial.id, ...values })
        : await createTaskAction(slug, values);
      if (!result.ok) {
        setError(errors(result.code));
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={initial.id ? t("editTitle") : t("addTitle")}>
      <form action={onSubmit} className="space-y-4" aria-busy={pending}>
        <Field
          id={`${id}-title`}
          name="title"
          label={t("fields.title")}
          defaultValue={initial.title}
          maxLength={200}
          error={titleError}
          required
        />
        <TextArea
          id={`${id}-description`}
          name="description"
          label={t("fields.description")}
          defaultValue={initial.description}
          rows={3}
          maxLength={4000}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id={`${id}-priority`}
            name="priority"
            label={t("fields.priority")}
            defaultValue={initial.priority}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorities(p)}
              </option>
            ))}
          </Select>
          <Select
            id={`${id}-status`}
            name="status"
            label={t("fields.status")}
            defaultValue={initial.status}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <Select
          id={`${id}-milestone`}
          name="milestoneId"
          label={t("fields.milestone")}
          defaultValue={initial.milestoneId ?? ""}
        >
          <option value="">{t("fields.noMilestone")}</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </Select>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {initial.id ? (
          <div className="flex flex-wrap items-center gap-2">
            <AskSaqinaButton
              context={{ type: "task", id: initial.id, label: initial.title }}
              onBeforeOpen={onClose}
              className="-ml-2"
            />
            {run ? (
              <Link
                href={`/project/${slug}/agents/runs/${run.runId}`}
                className="ml-auto inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <span>
                  {t("agent.current")}: {run.agentName}
                </span>
                <RunStatusChip status={run.status} />
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {states("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? states("saving") : states("save")}
          </Button>
        </div>
      </form>
      {initial.id && canEdit ? <AssignAgent slug={slug} taskId={initial.id} /> : null}
    </Dialog>
  );
}
