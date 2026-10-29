"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  removeServiceAction,
  saveServiceAction,
} from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select } from "@/components/ui/form";
import type { ServiceKind } from "@/lib/domain/enums";
import { SERVICE_PRESETS } from "@/lib/services/presets";
import type { ReadinessIssue } from "@/lib/services/preview-ready";
import type { ServicesState, ServiceView } from "@/lib/services/service";
import { cn } from "@/lib/utils";

type Failure = { code: string; fields?: Record<string, string> };
type Result = { ok: true; data?: unknown } | ({ ok: false } & Failure);

/** The message for one reason a preview is not ready; names a variable, never a value. */
export function IssueText({ issue }: { issue: ReadinessIssue }) {
  const t = useTranslations("studio.services.issues");
  return (
    <>
      {t(issue.code, { service: issue.service.split(":")[1] ?? issue.service, name: issue.name })}
    </>
  );
}

/** Why the preview is blocked, as a list. Used in the Publish and Preview tabs. */
export function ReadinessList({ issues }: { issues: ReadinessIssue[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {issues.map((i) => (
        <li key={`${i.code}-${i.service}-${i.name}`}>
          <IssueText issue={i} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Databases and sign-in services of the app, on the user's own accounts. Each variable has a
 * Production value and a separate Preview value, so a preview never touches real data. Values are
 * write-only: a filled variable shows as filled, never as its text.
 */
export function ServiceConnections({
  slug,
  state,
  canManage,
  onResult,
}: {
  slug: string;
  state: ServicesState;
  canManage: boolean;
  onResult: (r: Result, done?: string) => void;
}) {
  const t = useTranslations("studio.services");
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ServiceView | null>(null);
  const [pending, start] = useTransition();
  const id = useId();

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3 rounded-md border border-border p-3">
      <div>
        <h3 id={`${id}-h`} className="text-sm font-medium">
          {t("title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("intro")}</p>
      </div>

      {state.services.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-md border border-border">
            {state.services.map((s) => (
              <li key={s.id} className="space-y-2 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.label}</span>
                  <span className="font-mono text-xs text-subtle-foreground">
                    {t(`kind.${s.kind}`)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t(`status.${s.status}`)}
                  </span>
                </div>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {s.vars.map((v) => (
                    <li key={v.name} className="break-all font-mono text-xs">
                      {v.name}{" "}
                      <span className="text-subtle-foreground">
                        {t("filled", {
                          production: v.production ? t("yes") : t("no"),
                          preview: v.preview ? t("yes") : t("no"),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAdding(s.id)}>
                      {t("edit")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(s)}>
                      {t("remove")}
                    </Button>
                  </div>
                ) : null}
                {adding === s.id ? (
                  <ServiceForm
                    slug={slug}
                    existing={s}
                    onClose={() => setAdding(null)}
                    onResult={onResult}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {state.issues.length > 0 ? (
            <Notice tone="warning">
              <p className="mb-1 font-medium">{t("blocked")}</p>
              <ReadinessList issues={state.issues} />
            </Notice>
          ) : (
            <Notice tone="success">{t("ready")}</Notice>
          )}
        </>
      )}

      {canManage ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">{t("add")}</p>
          <div className="flex flex-wrap gap-2">
            {[...SERVICE_PRESETS, { id: "custom", name: t("custom") }].map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant="outline"
                aria-pressed={adding === p.id}
                onClick={() => setAdding(adding === p.id ? null : p.id)}
              >
                {p.name}
              </Button>
            ))}
          </div>
          {adding && !state.services.some((s) => s.id === adding) ? (
            <ServiceForm
              slug={slug}
              provider={adding}
              onClose={() => setAdding(null)}
              onResult={onResult}
            />
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        title={t("removeTitle", { name: removing?.label ?? "" })}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        pending={pending}
        onConfirm={() =>
          removing &&
          start(async () => {
            const r = await removeServiceAction(slug, removing.id);
            setRemoving(null);
            onResult(r);
          })
        }
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}

function ServiceForm({
  slug,
  provider,
  existing,
  onClose,
  onResult,
}: {
  slug: string;
  provider?: string;
  existing?: ServiceView;
  onClose: () => void;
  onResult: (r: Result, done?: string) => void;
}) {
  const t = useTranslations("studio.services");
  const id = useId();
  const [pending, start] = useTransition();
  const p = existing?.provider ?? provider ?? "custom";
  const preset = SERVICE_PRESETS.find((x) => x.id === p);
  const [kind, setKind] = useState<ServiceKind>(existing?.kind ?? "database");
  const [customNames, setCustomNames] = useState("");
  const vars =
    existing?.vars.map((v) => ({ name: v.name, secret: v.secret })) ??
    preset?.vars.map((v) => ({ name: v.name, secret: v.secret })) ??
    customNames
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((name) => ({ name, secret: true }));

  return (
    <form
      className="space-y-3 rounded-md border border-border bg-surface p-3"
      action={(form) =>
        start(async () => {
          const pick = (env: "production" | "preview") =>
            Object.fromEntries(
              vars
                .map((v) => [v.name, String(form.get(`${env}:${v.name}`) ?? "").trim()] as const)
                .filter(([, value]) => value),
            );
          const r = await saveServiceAction(slug, {
            id: existing?.id,
            provider: p,
            kind: preset ? undefined : kind,
            customVars: preset || existing ? undefined : vars,
            label: String(form.get("label") ?? "") || undefined,
            production: pick("production"),
            preview: pick("preview"),
          });
          onResult(r, t("saved"));
          if (r.ok) onClose();
        })
      }
    >
      {preset ? (
        <p className="text-xs text-muted-foreground">
          {t("ownAccount", { name: preset.name })}{" "}
          <a
            href={preset.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {t("docs")}
          </a>
        </p>
      ) : null}
      {!preset && !existing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            id={`${id}-kind`}
            label={t("kindLabel")}
            value={kind}
            onChange={(e) => setKind(e.target.value as ServiceKind)}
          >
            <option value="database">{t("kind.database")}</option>
            <option value="auth">{t("kind.auth")}</option>
          </Select>
          <Field
            id={`${id}-names`}
            label={t("customNames")}
            hint={t("customNamesHint")}
            value={customNames}
            onChange={(e) => setCustomNames(e.target.value.toUpperCase())}
            maxLength={400}
          />
        </div>
      ) : null}
      <Field
        id={`${id}-label`}
        name="label"
        label={t("label")}
        defaultValue={existing?.label ?? preset?.name ?? ""}
        maxLength={40}
        disabled={Boolean(existing)}
      />
      {vars.length === 0 ? null : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["production", "preview"] as const).map((env) => (
            <fieldset key={env} className={cn("space-y-3 rounded-md border border-border p-3")}>
              <legend className="px-1 text-sm font-medium">{t(`env.${env}`)}</legend>
              <p className="text-xs text-muted-foreground">{t(`envHint.${env}`)}</p>
              {vars.map((v) => (
                <Field
                  key={v.name}
                  id={`${id}-${env}-${v.name}`}
                  name={`${env}:${v.name}`}
                  type={v.secret ? "password" : "text"}
                  autoComplete="off"
                  label={v.name}
                  hint={
                    existing?.vars.find((x) => x.name === v.name)?.[env] ? t("kept") : undefined
                  }
                  maxLength={4000}
                />
              ))}
            </fieldset>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || vars.length === 0}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
