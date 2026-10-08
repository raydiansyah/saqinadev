"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { updateMilestoneAction } from "@/app/[locale]/(app)/project/[slug]/plan/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";

/** Edit button plus dialog for a milestone's title and goal. */
export function MilestoneEdit({
  slug,
  milestone,
}: {
  slug: string;
  milestone: { id: string; title: string; goal: string };
}) {
  const t = useTranslations("plan");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string>();

  function close() {
    setOpen(false);
    setError(null);
    setTitleError(undefined);
  }

  function onSubmit(form: FormData) {
    const values = {
      id: milestone.id,
      title: String(form.get("title") ?? "").trim(),
      goal: String(form.get("goal") ?? "").trim(),
    };
    if (values.title.length < 2) {
      setTitleError(errors("VALIDATION_ERROR"));
      return;
    }
    setTitleError(undefined);
    setError(null);
    startTransition(async () => {
      const result = await updateMilestoneAction(slug, values);
      if (!result.ok) {
        setError(errors(result.code));
        return;
      }
      close();
    });
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {states("edit")}
        <span className="sr-only">: {milestone.title}</span>
      </Button>
      {open ? (
        <Dialog open onClose={close} title={t("editMilestone")}>
          <form action={onSubmit} className="space-y-4" aria-busy={pending}>
            <Field
              id={`${id}-title`}
              name="title"
              label={t("fields.title")}
              defaultValue={milestone.title}
              maxLength={120}
              error={titleError}
              required
            />
            <TextArea
              id={`${id}-goal`}
              name="goal"
              label={t("fields.goal")}
              defaultValue={milestone.goal}
              rows={3}
              maxLength={1000}
            />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={close}>
                {states("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? states("saving") : states("save")}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
