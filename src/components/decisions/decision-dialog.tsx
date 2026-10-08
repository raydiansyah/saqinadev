"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import { createDecisionAction } from "@/app/[locale]/(app)/project/[slug]/decisions/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";

type FieldName = "question" | "options" | "selected" | "reason";

/** One option per line; blanks and duplicates are dropped so the select stays clean. */
function parseOptions(text: string): string[] {
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

/** Records a decision. The selected option list follows the options as they are typed. */
export function DecisionDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const t = useTranslations("decisions");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [optionsText, setOptionsText] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const options = useMemo(() => parseOptions(optionsText), [optionsText]);
  const selectedValue = options.includes(selected) ? selected : "";

  function onSubmit(form: FormData) {
    const values = {
      question: String(form.get("question") ?? "").trim(),
      context: String(form.get("context") ?? "").trim(),
      options,
      selected: selectedValue,
      reason: String(form.get("reason") ?? "").trim(),
    };
    const invalid = errors("VALIDATION_ERROR");
    const next: Partial<Record<FieldName, string>> = {
      question: values.question.length < 5 ? invalid : undefined,
      options: options.length === 0 ? invalid : undefined,
      selected: options.includes(values.selected) ? undefined : t("selectedNotOption"),
      reason: values.reason.length < 3 ? invalid : undefined,
    };
    setFieldErrors(next);
    if (Object.values(next).some(Boolean)) return;

    startTransition(async () => {
      const result = await createDecisionAction(slug, values);
      if (!result.ok) {
        if (result.fields?.selected) setFieldErrors({ selected: t("selectedNotOption") });
        setError(errors(result.code));
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={t("addTitle")} className="max-w-xl">
      <form action={onSubmit} className="space-y-4" aria-busy={pending}>
        <Field
          id={`${id}-question`}
          name="question"
          label={t("fields.question")}
          maxLength={300}
          error={fieldErrors.question}
          required
        />
        <TextArea
          id={`${id}-context`}
          name="context"
          label={t("fields.context")}
          rows={3}
          maxLength={2000}
        />
        <TextArea
          id={`${id}-options`}
          name="options"
          label={t("fields.options")}
          hint={t("fields.optionsHint")}
          rows={4}
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          error={fieldErrors.options}
          required
        />
        <Select
          id={`${id}-selected`}
          name="selected"
          label={t("fields.selected")}
          value={selectedValue}
          onChange={(e) => setSelected(e.target.value)}
          disabled={options.length === 0}
          error={fieldErrors.selected}
          required
        >
          <option value="" disabled>
            {t("fields.selected")}
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <TextArea
          id={`${id}-reason`}
          name="reason"
          label={t("fields.reason")}
          rows={3}
          maxLength={2000}
          error={fieldErrors.reason}
          required
        />
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
