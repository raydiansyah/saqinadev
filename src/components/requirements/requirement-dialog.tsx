"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  createRequirementAction,
  updateRequirementAction,
} from "@/app/[locale]/(app)/project/[slug]/requirements/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";
import {
  PRIORITIES,
  REQUIREMENT_GROUPS,
  REQUIREMENT_STATUSES,
  type RequirementGroup,
} from "@/lib/domain/enums";
import type { RequirementView } from "@/lib/requirements/service";

export interface RequirementDraftForm {
  id?: string;
  group: RequirementGroup;
  title: string;
  description: string;
  priority: RequirementView["priority"];
  status: RequirementView["status"];
}

/** Create or edit one requirement. Saving attributes it to the user. */
export function RequirementDialog({
  slug,
  initial,
  groupLabels,
  onClose,
}: {
  slug: string;
  initial: RequirementDraftForm | null;
  groupLabels: Record<RequirementGroup, string>;
  onClose: () => void;
}) {
  const t = useTranslations("requirements");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string>();

  if (!initial) return null;

  function onSubmit(form: FormData) {
    const values = {
      group: String(form.get("group")),
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      priority: String(form.get("priority")),
      status: String(form.get("status")),
    };
    if (values.title.length < 2) {
      setTitleError(errors("VALIDATION_ERROR"));
      return;
    }
    setTitleError(undefined);
    startTransition(async () => {
      const result = initial?.id
        ? await updateRequirementAction(slug, { id: initial.id, ...values })
        : await createRequirementAction(slug, values);
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
          maxLength={160}
          error={titleError}
          required
        />
        <TextArea
          id={`${id}-description`}
          name="description"
          label={t("fields.description")}
          defaultValue={initial.description}
          rows={3}
          maxLength={2000}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            id={`${id}-group`}
            name="group"
            label={t("fields.group")}
            defaultValue={initial.group}
          >
            {REQUIREMENT_GROUPS.map((g) => (
              <option key={g} value={g}>
                {groupLabels[g]}
              </option>
            ))}
          </Select>
          <Select
            id={`${id}-priority`}
            name="priority"
            label={t("fields.priority")}
            defaultValue={initial.priority}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priorities.${p}`)}
              </option>
            ))}
          </Select>
          <Select
            id={`${id}-status`}
            name="status"
            label={t("fields.status")}
            defaultValue={initial.status}
          >
            {REQUIREMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {states("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? states("saving") : states("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
