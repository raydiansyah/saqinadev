"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  createMemoryAction,
  updateMemoryAction,
} from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/domain/enums";

export interface MemoryDraft {
  id?: string;
  title: string;
  content: string;
  category: MemoryCategory;
  importance: "high" | "normal";
}

/** Create or edit one memory. Saved memories are attributed to the user. */
export function MemoryDialog({
  slug,
  initial,
  onClose,
}: {
  slug: string;
  initial: MemoryDraft;
  onClose: () => void;
}) {
  const t = useTranslations("memory");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; content?: string }>({});

  function onSubmit(form: FormData) {
    const values = {
      title: String(form.get("title") ?? "").trim(),
      content: String(form.get("content") ?? "").trim(),
      category: String(form.get("category")),
      importance: form.get("important") === "on" ? "high" : "normal",
    };
    const invalid = errors("VALIDATION_ERROR");
    const nextErrors = {
      title: values.title.length < 2 ? invalid : undefined,
      content: values.content.length < 1 ? invalid : undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.title || nextErrors.content) return;

    startTransition(async () => {
      const result = initial.id
        ? await updateMemoryAction(slug, { id: initial.id, ...values })
        : await createMemoryAction(slug, values);
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
          error={fieldErrors.title}
          required
        />
        <TextArea
          id={`${id}-content`}
          name="content"
          label={t("fields.content")}
          defaultValue={initial.content}
          rows={5}
          maxLength={4000}
          error={fieldErrors.content}
          required
        />
        <Select
          id={`${id}-category`}
          name="category"
          label={t("fields.category")}
          defaultValue={initial.category}
        >
          {MEMORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </Select>
        <label
          htmlFor={`${id}-important`}
          className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium"
        >
          <input
            id={`${id}-important`}
            type="checkbox"
            name="important"
            defaultChecked={initial.importance === "high"}
            className="size-4 accent-primary"
          />
          {t("fields.important")}
        </label>
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
