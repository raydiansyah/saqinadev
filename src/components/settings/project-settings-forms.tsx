"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useId, useState, useTransition } from "react";
import {
  deleteProjectAction,
  setArchivedAction,
  updateGeneralAction,
  updateSettingsAction,
} from "@/app/[locale]/(app)/project/[slug]/settings/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { SaveIndicator, type SaveState } from "@/components/app/save-indicator";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/ui/form";
import { BUILD_STRATEGIES, DEPLOY_PROVIDERS, REPO_PROVIDERS } from "@/lib/domain/enums";
import type { ActionResult, FieldErrors } from "@/lib/errors";

export interface SettingsValues {
  name: string;
  description: string;
  buildStrategy: (typeof BUILD_STRATEGIES)[number];
  repoProvider: string;
  repoUrl: string;
  defaultBranch: string;
  deployProvider: string;
  environment: string;
  domain: string;
  aiProvider: string;
  aiModel: string;
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
        action={(form) =>
          save.run(() =>
            updateGeneralAction(slug, {
              name: form.get("name"),
              description: form.get("description"),
            }),
          )
        }
      >
        <Field
          id={`${id}-name`}
          name="name"
          label={t("name")}
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

export function TechnicalForm({
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
  const [strategy, setStrategy] = useState(values.buildStrategy);
  // Building with Saqina always deploys to <slug>.saqina.dev: nothing to configure.
  const managedDeploy = strategy === "saqina";
  const text = (name: keyof SettingsValues, label: string, error?: string) => (
    <Field
      id={`${id}-${name}`}
      name={name}
      label={label}
      defaultValue={values[name]}
      placeholder={t("notSet")}
      disabled={!canEdit}
      error={error}
    />
  );
  return (
    <form
      className="space-y-6"
      action={(form) =>
        save.run(() =>
          updateSettingsAction(slug, {
            buildStrategy: form.get("buildStrategy"),
            repoProvider: form.get("repoProvider") || null,
            repoUrl: form.get("repoUrl") ?? "",
            defaultBranch: form.get("defaultBranch") ?? "",
            // Hidden deploy fields keep their stored values instead of being cleared.
            deployProvider: managedDeploy
              ? values.deployProvider || null
              : form.get("deployProvider") || null,
            environment: managedDeploy ? values.environment : (form.get("environment") ?? ""),
            domain: managedDeploy ? values.domain : (form.get("domain") ?? ""),
            aiProvider: form.get("aiProvider") ?? "",
            aiModel: form.get("aiModel") ?? "",
          }),
        )
      }
    >
      <Section id={`${id}-build`} title={t("buildStrategy")}>
        <Select
          id={`${id}-strategy`}
          name="buildStrategy"
          label={t("buildStrategy")}
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as typeof strategy)}
          disabled={!canEdit}
        >
          {BUILD_STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {t(`strategies.${s}`)}
            </option>
          ))}
        </Select>
      </Section>
      <Section id={`${id}-technical`} title={t("technical")} hint={t("technicalHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id={`${id}-repoProvider`}
            name="repoProvider"
            label={t("repoProvider")}
            defaultValue={values.repoProvider}
            disabled={!canEdit}
          >
            <option value="">{t("notSet")}</option>
            {REPO_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p === "custom" ? "Custom Git" : p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </Select>
          {text("repoUrl", t("repoUrl"), save.fields.repoUrl ? t("invalidUrl") : undefined)}
          {text("defaultBranch", t("defaultBranch"))}
          {managedDeploy ? (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium">{t("deployProvider")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("managedDeploy", { domain: `${slug}.saqina.dev` })}
              </p>
            </div>
          ) : (
            <>
              <Select
                id={`${id}-deployProvider`}
                name="deployProvider"
                label={t("deployProvider")}
                defaultValue={values.deployProvider}
                disabled={!canEdit}
              >
                <option value="">{t("notSet")}</option>
                {DEPLOY_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "vercel" ? "Vercel" : p === "self-hosted" ? "Self-hosted" : "Other"}
                  </option>
                ))}
              </Select>
              {text("environment", t("environment"))}
              {text("domain", t("domain"), save.fields.domain ? t("invalidDomain") : undefined)}
            </>
          )}
          {text("aiProvider", t("aiProvider"))}
          {text("aiModel", t("aiModel"))}
        </div>
      </Section>
      {canEdit ? (
        <div className="flex items-center justify-between gap-3">
          <SaveIndicator state={save.state} />
          <Button type="submit" size="sm" disabled={save.pending}>
            {states("save")}
          </Button>
        </div>
      ) : null}
    </form>
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
