"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useRun } from "@/components/platform/use-run";
import { BrandMark } from "@/components/primitives/brand-mark";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import { onSubmitData } from "@/components/ui/form-submit";
import { removeLogoAction, saveBrandAction, saveLogoAction } from "../actions";

export interface BrandValues {
  name: string;
  legalName: string;
  taxNumber: string;
  address: string;
  accentColor: string;
  emailFromName: string;
  replyTo: string;
  logoUrl: string | null;
}

const MAX_KB = 200;

/** The brand an organization shows its clients. Only rendered while white label is open. */
export function BrandForm({ values, canEdit }: { values: BrandValues; canEdit: boolean }) {
  const t = useTranslations("app.whiteLabel.brand");
  const id = useId();
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  const [accent, setAccent] = useState(values.accentColor);
  const key = error?.field?.replace(/^whiteLabel\.brand\./, "");
  const message = error
    ? key && t.has(`errors.${key}` as never)
      ? t(`errors.${key}` as never)
      : t("errors.generic")
    : null;

  return (
    <section aria-labelledby={`${id}-brand`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-brand`} className="font-medium">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <BrandMark brand={{ name: values.name || null, logoUrl: values.logoUrl }} />
        </div>
        {canEdit ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setSaved(false);
              run(
                () => saveLogoAction(data),
                () => setSaved(true),
              );
            }}
          >
            <label htmlFor={`${id}-logo`} className="sr-only">
              {t("logo")}
            </label>
            <input
              id={`${id}-logo`}
              name="logo"
              type="file"
              accept="image/png,image/jpeg"
              required
              className="max-w-56 text-sm file:mr-2 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
            />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {t("uploadLogo")}
            </Button>
            {values.logoUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => removeLogoAction())}
              >
                {t("removeLogo")}
              </Button>
            ) : null}
          </form>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("logoHint", { kb: MAX_KB })}</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={onSubmitData((form) => {
          setSaved(false);
          run(
            () =>
              saveBrandAction({
                brandName: form.get("brandName"),
                legalName: form.get("legalName"),
                taxNumber: form.get("taxNumber"),
                address: form.get("address"),
                accentColor: form.get("accentColor"),
                emailFromName: form.get("emailFromName"),
                replyTo: form.get("replyTo"),
              }),
            () => setSaved(true),
          );
        })}
      >
        <Field
          id={`${id}-name`}
          name="brandName"
          label={t("brandName")}
          hint={t("brandNameHint")}
          defaultValue={values.name}
          maxLength={80}
          disabled={!canEdit}
        />
        <Field
          id={`${id}-legal`}
          name="legalName"
          label={t("legalName")}
          hint={t("legalNameHint")}
          defaultValue={values.legalName}
          maxLength={120}
          disabled={!canEdit}
        />
        <Field
          id={`${id}-tax`}
          name="taxNumber"
          label={t("taxNumber")}
          defaultValue={values.taxNumber}
          maxLength={40}
          disabled={!canEdit}
        />
        <TextArea
          id={`${id}-address`}
          name="address"
          label={t("address")}
          defaultValue={values.address}
          rows={3}
          maxLength={300}
          disabled={!canEdit}
        />
        <div>
          <label htmlFor={`${id}-accent`} className="mb-1.5 block text-sm font-medium">
            {t("accent")}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label={t("accentPicker")}
              value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#ff6a55"}
              onChange={(e) => setAccent(e.target.value)}
              disabled={!canEdit}
              className="size-11 cursor-pointer rounded-md border border-border bg-transparent p-1"
            />
            <input
              id={`${id}-accent`}
              name="accentColor"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder="#1f6feb"
              maxLength={7}
              disabled={!canEdit}
              className="h-11 w-32 rounded-md border border-border bg-surface px-3 font-mono text-sm"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("accentHint")}</p>
        </div>
        <Field
          id={`${id}-from`}
          name="emailFromName"
          label={t("emailFromName")}
          hint={t("emailFromNameHint")}
          defaultValue={values.emailFromName}
          maxLength={80}
          disabled={!canEdit}
        />
        <Field
          id={`${id}-reply`}
          name="replyTo"
          type="email"
          label={t("replyTo")}
          defaultValue={values.replyTo}
          maxLength={200}
          disabled={!canEdit}
        />
        {message ? <Notice tone="error">{message}</Notice> : null}
        {saved && !error ? <Notice tone="success">{t("saved")}</Notice> : null}
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
        )}
      </form>
    </section>
  );
}
