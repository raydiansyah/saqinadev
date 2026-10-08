"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import {
  resolveMismatchAction,
  setProjectAiAction,
  updateStackAction,
} from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select } from "@/components/ui/form";
import type { TechStack } from "@/lib/db/schema/projects";
import { STACK_KEYS } from "@/lib/domain/enums";

export function ProjectAiForm({
  slug,
  view,
  canEdit,
}: {
  slug: string;
  view: {
    allowProjectOverride: boolean;
    allowAgentOverride: boolean;
    preferredModelId: string | null;
    allowAgentOverrides: boolean;
    options: { id: string; label: string }[];
    resolved: { agent: string; model: string | null; source: string }[];
  };
  canEdit: boolean;
}) {
  const t = useTranslations("integrations.ai");
  const id = useId();
  const { pending, error, run } = useRun();
  return (
    <section aria-labelledby={`${id}-ai`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-ai`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      {!view.allowProjectOverride ? (
        <Notice tone="info" className="mt-3">
          {t("notAllowed")}
        </Notice>
      ) : null}
      <form
        key={`${view.preferredModelId}-${view.allowAgentOverrides}`}
        className="mt-4 space-y-3"
        action={(form) =>
          run(() =>
            setProjectAiAction(slug, {
              preferredModelId: String(form.get("preferred") ?? "") || null,
              allowAgentOverrides: form.get("agents") === "on",
            }),
          )
        }
      >
        <fieldset disabled={!canEdit} className="space-y-3">
          <Select
            id={`${id}-preferred`}
            name="preferred"
            label={t("preferred")}
            defaultValue={view.preferredModelId ?? ""}
            disabled={!view.allowProjectOverride}
          >
            <option value="">{t("platformDefault")}</option>
            {view.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="agents"
              defaultChecked={view.allowAgentOverrides}
              disabled={!view.allowAgentOverride}
              className="size-4 accent-[var(--primary)]"
            />
            {t("allowAgent")}
          </label>
          <Button size="sm" type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </fieldset>
        <FormError error={error} />
      </form>
      <h3 className="mt-5 font-mono text-xs uppercase tracking-wide text-subtle-foreground">
        {t("resolved")}
      </h3>
      <ul className="mt-2 divide-y divide-border text-sm">
        {view.resolved.map((r) => (
          <li key={r.agent} className="flex flex-wrap gap-x-3 py-1.5">
            <span className="font-medium">{r.agent}</span>
            <span className="text-muted-foreground">{r.model ?? "-"}</span>
            <span className="ml-auto font-mono text-xs text-subtle-foreground">
              {t(`sources.${r.source as "none"}`)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TechStackForm({
  slug,
  stack,
  canEdit,
}: {
  slug: string;
  stack: TechStack;
  canEdit: boolean;
}) {
  const t = useTranslations("integrations.stack");
  const id = useId();
  const { pending, error, run } = useRun();
  return (
    <section aria-labelledby={`${id}-stack`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-stack`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      <ul className="mt-4 space-y-3">
        {STACK_KEYS.filter((k) => k !== "repository").map((key) => (
          <li key={key}>
            <form
              key={`${key}-${stack[key]?.value ?? ""}`}
              className="flex flex-wrap items-end gap-2"
              action={(form) =>
                run(() => updateStackAction(slug, { key, value: String(form.get("value") ?? "") }))
              }
            >
              <div className="min-w-48 flex-1">
                <Field
                  id={`${id}-${key}`}
                  name="value"
                  label={t(`keys.${key}`)}
                  hint={stack[key] ? t(`sources.${stack[key].source}`) : undefined}
                  defaultValue={stack[key]?.value ?? ""}
                  maxLength={120}
                  disabled={!canEdit}
                />
              </div>
              {canEdit ? (
                <Button size="sm" variant="outline" type="submit" disabled={pending}>
                  {t("save")}
                  <span className="sr-only">: {t(`keys.${key}`)}</span>
                </Button>
              ) : null}
            </form>
          </li>
        ))}
      </ul>
      <FormError error={error} />
    </section>
  );
}

/** The project plan and the repository disagree: the user decides, nothing is assumed. */
export function MismatchPanel({
  slug,
  mismatches,
  canEdit,
}: {
  slug: string;
  mismatches: { key: string; project: string; repository: string }[];
  canEdit: boolean;
}) {
  const t = useTranslations("integrations.stack");
  const { pending, error, run } = useRun();
  if (mismatches.length === 0) return null;
  return (
    <section
      aria-labelledby="mismatch-heading"
      className="rounded-lg border border-warning/50 bg-surface p-5"
    >
      <h2 id="mismatch-heading" className="font-semibold text-warning">
        {t("mismatchTitle")}
      </h2>
      <ul className="mt-3 space-y-3 text-sm">
        {mismatches.map((m) => (
          <li key={m.key}>
            <p>
              {t("mismatch", {
                key: t(`keys.${m.key as "backend"}`),
                project: m.project,
                repository: m.repository,
              })}
            </p>
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => resolveMismatchAction(slug, { key: m.key, keep: "project" }))
                  }
                >
                  {t("keepProject", { value: m.project })}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => resolveMismatchAction(slug, { key: m.key, keep: "repository" }))
                  }
                >
                  {t("keepRepo", { value: m.repository })}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <FormError error={error} />
    </section>
  );
}
