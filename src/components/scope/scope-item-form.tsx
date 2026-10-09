"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { FormError } from "@/components/platform/form-error";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/ui/form";
import { SCOPE_CATEGORIES, type ScopeCategory } from "@/lib/domain/business";

export interface ScopeValues {
  title: string;
  description: string;
  category: ScopeCategory;
  clientVisible: boolean;
}

/** Add and edit share one form; the parent decides which action runs. */
export function ScopeItemForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: ScopeValues;
  submitLabel: string;
  pending: boolean;
  error: { code: string; field?: string } | null;
  onSubmit: (values: ScopeValues) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("scope");
  const id = useId();
  return (
    <form
      className="space-y-3"
      action={(form) =>
        onSubmit({
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          category: String(form.get("category")) as ScopeCategory,
          clientVisible: form.get("clientVisible") === "on",
        })
      }
    >
      <Field
        id={`${id}-title`}
        name="title"
        label={t("itemTitle")}
        defaultValue={initial.title}
        required
        minLength={2}
        maxLength={160}
      />
      <TextArea
        id={`${id}-description`}
        name="description"
        label={t("itemDescription")}
        defaultValue={initial.description}
        rows={2}
        maxLength={1000}
      />
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Select
          id={`${id}-category`}
          name="category"
          label={t("category")}
          defaultValue={initial.category}
        >
          {SCOPE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="clientVisible"
            defaultChecked={initial.clientVisible}
            className="size-4 accent-primary"
          />
          {t("visible")}
        </label>
      </div>
      <FormError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
