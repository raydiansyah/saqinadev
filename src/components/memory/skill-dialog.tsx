"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  createSkillAction,
  updateSkillAction,
} from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { lines, parseSteps, stepsText } from "@/lib/memory/skills/form";

export interface SkillDraft {
  id?: string;
  name: string;
  description: string;
  useCase: string;
  triggers: string[];
  exclusions: string[];
  prerequisites: string[];
  steps: { title: string; detail: string }[];
  outputs: string[];
  validation: string[];
}

export const EMPTY_SKILL: SkillDraft = {
  name: "",
  description: "",
  useCase: "",
  triggers: [],
  exclusions: [],
  prerequisites: [],
  steps: [],
  outputs: [],
  validation: [],
};

const FIELDS = [
  ["triggers", 3],
  ["exclusions", 3],
  ["prerequisites", 2],
  ["outputs", 2],
  ["validation", 3],
] as const;

/** Write or edit a skill in plain text; the server validates and judges it. */
export function SkillDialog({
  slug,
  initial,
  onClose,
}: {
  slug: string;
  initial: SkillDraft;
  onClose: () => void;
}) {
  const t = useTranslations("memoryHub.skills");
  const errors = useTranslations("app.errors");
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(form: FormData) {
    const text = (name: string) => String(form.get(name) ?? "");
    const values = {
      name: text("name").trim(),
      description: text("description").trim(),
      useCase: text("useCase").trim(),
      triggers: lines(text("triggers")),
      exclusions: lines(text("exclusions")),
      prerequisites: lines(text("prerequisites")),
      steps: parseSteps(text("steps")),
      outputs: lines(text("outputs")),
      validation: lines(text("validation")),
    };
    setError(null);
    startTransition(async () => {
      const result = initial.id
        ? await updateSkillAction(slug, { id: initial.id, ...values })
        : await createSkillAction(slug, values);
      if (!result.ok) {
        setError(
          result.fields?.steps === "contains_secret"
            ? t("errors.contains_secret")
            : errors(result.code),
        );
        return;
      }
      onClose();
      const created = result.data as { id?: string } | undefined;
      if (!initial.id && created?.id) router.push(`/project/${slug}/memory/skills/${created.id}`);
    });
  }

  return (
    <Dialog open onClose={onClose} title={initial.id ? t("edit") : t("new")}>
      <form action={onSubmit} className="space-y-4" aria-busy={pending}>
        <Field
          id={`${id}-name`}
          name="name"
          label={t("fields.name")}
          defaultValue={initial.name}
          maxLength={120}
          required
        />
        <TextArea
          id={`${id}-description`}
          name="description"
          label={t("fields.description")}
          defaultValue={initial.description}
          rows={2}
          maxLength={600}
          required
        />
        <TextArea
          id={`${id}-useCase`}
          name="useCase"
          label={t("fields.useCase")}
          defaultValue={initial.useCase}
          rows={2}
          maxLength={600}
        />
        {FIELDS.map(([key, rows]) => (
          <TextArea
            key={key}
            id={`${id}-${key}`}
            name={key}
            label={t(`fields.${key}`)}
            defaultValue={initial[key].join("\n")}
            rows={rows}
          />
        ))}
        <TextArea
          id={`${id}-steps`}
          name="steps"
          label={t("fields.steps")}
          defaultValue={stepsText(initial.steps)}
          rows={5}
          required
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewSkillButton({ slug }: { slug: string }) {
  const t = useTranslations("memoryHub.skills");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("new")}</Button>
      {open ? (
        <SkillDialog slug={slug} initial={EMPTY_SKILL} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function EditSkillButton({ slug, skill }: { slug: string; skill: SkillDraft }) {
  const t = useTranslations("memoryHub.skills");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t("edit")}
      </Button>
      {open ? <SkillDialog slug={slug} initial={skill} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
