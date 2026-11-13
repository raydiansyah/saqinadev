"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useId, useState, useTransition } from "react";
import {
  deleteProjectAction,
  setArchivedAction,
  updateGeneralAction,
} from "@/app/[locale]/(app)/project/[slug]/settings/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { SaveIndicator, type SaveState } from "@/components/app/save-indicator";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/form";
import { onSubmitData } from "@/components/ui/form-submit";
import type { ActionResult, FieldErrors } from "@/lib/errors";

export interface SettingsValues {
  name: string;
  description: string;
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border p-5">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Shared submit flow: save state, field errors, translated failures. */
function useSave() {
  const errors = useTranslations("app.errors");
  const [state, setState] = useState<SaveState>("idle");
  const [fields, setFields] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>) => {
    setState("saving");
    startTransition(async () => {
      const result = await action();
      setFields(result.ok ? {} : (result.fields ?? {}));
      setMessage(result.ok ? null : errors(result.code));
      setState(result.ok ? "saved" : "error");
    });
  };
  return { state, fields, message, pending, run };
}

export function GeneralForm({
  slug,
  values,
  canEdit,
}: {
  slug: string;
  values: SettingsValues;
  canEdit: boolean;
}) {
  const t = useTranslations("project.settings");
  const states = useTranslations("app.states");
  const id = useId();
  const save = useSave();
  return (
    <Section id={`${id}-general`} title={t("general")}>
      <form
        className="space-y-4"
        onSubmit={onSubmitData((form) =>
          save.run(() =>
            updateGeneralAction(slug, {
              name: form.get("name"),
              description: form.get("description"),
            }),
          ),
        )}
      >
        <Field
          id={`${id}-name`}
          name="name"
          label={t("name")}
          placeholder={t("namePlaceholder")}
          defaultValue={values.name}
          maxLength={80}
          required
          disabled={!canEdit}
          error={save.fields.name ? (save.message ?? undefined) : undefined}
        />
        <TextArea
          id={`${id}-description`}
          name="description"
          label={t("description")}
          placeholder={t("descriptionPlaceholder")}
          defaultValue={values.description}
          rows={3}
          maxLength={2000}
          disabled={!canEdit}
        />
        {canEdit ? (
          <div className="flex items-center justify-between gap-3">
            <SaveIndicator state={save.state} />
            <Button type="submit" size="sm" disabled={save.pending}>
              {states("save")}
            </Button>
          </div>
        ) : null}
      </form>
    </Section>
  );
}

export function DangerZone({
  slug,
  name,
  archived,
}: {
  slug: string;
  name: string;
  archived: boolean;
}) {
  const t = useTranslations("project.settings");
  const locale = useLocale();
  const errors = useTranslations("app.errors");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <section aria-labelledby={`${id}-danger`} className="rounded-lg border border-error/40 p-5">
      <h2 id={`${id}-danger`} className="font-semibold text-error">
        {t("danger")}
      </h2>
      <div className="mt-4 divide-y divide-border">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{archived ? t("restore") : t("archive")}</p>
            <p className="text-sm text-muted-foreground">
              {archived ? t("restoreBody") : t("archiveBody")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setArchivedAction(slug, !archived);
                setError(result.ok ? null : errors(result.code));
              })
            }
          >
            {archived ? t("restore") : t("archive")}
          </Button>
        </div>
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{t("delete")}</p>
            <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
          </div>
          <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
            {t("delete")}
          </Button>
        </div>
      </div>
      {error && !confirming ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={t("deleteConfirmTitle", { name })}
        body={
          <>
            <p>{t("deleteConfirmBody")}</p>
            <p className="mt-3 font-mono text-foreground">{name}</p>
          </>
        }
        confirmLabel={t("delete")}
        confirmText={name}
        confirmTextLabel={t("deleteConfirmLabel")}
        pending={pending}
        error={error}
        onClose={() => {
          setConfirming(false);
          setError(null);
        }}
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteProjectAction(slug, name, locale);
            if (result && !result.ok)
              setError(
                result.code === "VALIDATION_ERROR" ? t("deleteMismatch") : errors(result.code),
              );
          })
        }
      />
    </section>
  );
}
