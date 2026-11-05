"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useMemo, useState, useTransition } from "react";
import {
  addMissingEnvNamesAction,
  importEnvAction,
  removeEnvVarAction,
  saveEnvVarAction,
} from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Notice } from "@/components/ui/form";
import { ENVIRONMENTS, isPublicName } from "@/lib/env-vars/rules";
import type { EnvState, EnvVarView } from "@/lib/env-vars/service";
import type { EnvGap } from "@/lib/services/env-files";
import { cn } from "@/lib/utils";

type Failure = { code: string; fields?: Record<string, string> };
type Result = { ok: true; data?: unknown } | ({ ok: false } & Failure);
type Env = (typeof ENVIRONMENTS)[number];

interface ImportSummary {
  added: string[];
  updated: string[];
  kept: string[];
  skipped: string[];
  invalid: Array<{ line: number; reason: string }>;
}

/** One environment's state for one variable: filled or empty, never the value. */
function EnvChip({ env, filled, fallback }: { env: Env; filled: boolean; fallback?: boolean }) {
  const t = useTranslations("studio.env");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
        filled ? "border-success/40 text-success" : "border-border text-muted-foreground",
      )}
    >
      <span className="font-medium">{t(`env.${env}`)}</span>
      <span aria-hidden="true">{filled ? "✓" : "–"}</span>
      <span className="sr-only">{filled ? t("set") : t("empty")}</span>
      {!filled && fallback ? (
        <span className="text-subtle-foreground">({t("usesPreview")})</span>
      ) : null}
    </span>
  );
}

/**
 * The environment variables of the app, as on a hosting dashboard: a list with a value per
 * environment, add, edit, import a pasted .env, remove. Values are write-only: a filled environment
 * shows as filled, and saving with an empty field keeps what is stored.
 */
export function EnvironmentVariables({
  slug,
  env,
  gap,
  canManage,
  onResult,
}: {
  slug: string;
  env: EnvState;
  gap: EnvGap | null;
  canManage: boolean;
  onResult: (r: Result, done?: string) => void;
}) {
  const t = useTranslations("studio.env");
  const id = useId();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EnvVarView | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<EnvVarView | null>(null);
  const [pending, start] = useTransition();

  const q = query.trim().toLowerCase();
  const vars = useMemo(
    () =>
      env.vars.filter(
        (v) => !q || v.name.toLowerCase().includes(q) || v.comment.toLowerCase().includes(q),
      ),
    [env.vars, q],
  );
  const services = env.fromServices.filter((v) => !q || v.name.toLowerCase().includes(q));
  const missing = gap?.missingInSaqina ?? [];

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3 rounded-md border border-border p-3">
      <div>
        <h3 id={`${id}-h`} className="text-sm font-medium">
          {t("title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`${id}-q`} className="sr-only">
          {t("search")}
        </label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className={cn(FIELD_CLASS, "min-h-11 sm:min-h-9 sm:max-w-xs")}
        />
        {canManage ? (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => setEditing("new")}>
              {t("add")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => setImporting(true)}
            >
              {t("import")}
            </Button>
          </div>
        ) : null}
      </div>

      {missing.length > 0 ? (
        <Notice tone="warning">
          <p className="break-words">{t("gap", { names: missing.join(", ") })}</p>
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 min-h-11 sm:min-h-9"
              disabled={pending}
              onClick={() =>
                start(async () => onResult(await addMissingEnvNamesAction(slug), t("gapAdded")))
              }
            >
              {t("gapAdd")}
            </Button>
          ) : null}
        </Notice>
      ) : null}

      {env.vars.length === 0 && services.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : vars.length === 0 && services.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
      ) : null}

      {vars.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {vars.map((v) => (
            <li key={v.id} className="space-y-2 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="break-all font-mono text-sm font-medium">{v.name}</span>
                <span className="rounded border border-border px-1.5 text-[0.6875rem] text-muted-foreground">
                  {v.secret ? t("secret") : t("public")}
                </span>
                {v.source !== "manual" ? (
                  <span className="text-xs text-subtle-foreground">
                    {v.source === "repository" ? t("fromRepository") : t("fromImport")}
                  </span>
                ) : null}
              </div>
              {v.comment ? (
                <p className="break-words text-xs text-muted-foreground">{v.comment}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                <EnvChip env="production" filled={v.filled.production} />
                <EnvChip env="preview" filled={v.filled.preview} />
                <EnvChip
                  env="development"
                  filled={v.filled.development}
                  fallback={v.filled.preview}
                />
              </div>
              {v.lastError ? (
                <p className="text-xs text-warning">{t("notSent")}</p>
              ) : v.lastSyncedAt ? (
                <p className="text-xs text-subtle-foreground">{t("sent")}</p>
              ) : null}
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => setEditing(v)}
                  >
                    {t("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => setRemoving(v)}
                  >
                    {t("remove")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {services.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("servicesGroup")}</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {services.map((v) => (
              <li key={`${v.service}-${v.name}`} className="space-y-1.5 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="break-all font-mono text-sm">{v.name}</span>
                  <span className="text-xs text-subtle-foreground">
                    {t("fromService", { service: v.service })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <EnvChip env="production" filled={v.filled.production} />
                  <EnvChip env="preview" filled={v.filled.preview} />
                  <EnvChip
                    env="development"
                    filled={v.filled.development}
                    fallback={v.filled.preview}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <EnvVarDialog
          key={editing === "new" ? "new" : editing.id}
          slug={slug}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onResult={(r) => {
            onResult(r, t("saved"));
            if (r.ok) setEditing(null);
          }}
        />
      ) : null}

      {importing ? (
        <ImportDialog slug={slug} onClose={() => setImporting(false)} onResult={onResult} />
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        title={t("removeTitle", { name: removing?.name ?? "" })}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        pending={pending}
        onConfirm={() =>
          removing &&
          start(async () => {
            const r = await removeEnvVarAction(slug, { id: removing.id });
            setRemoving(null);
            onResult(
              r,
              r.ok &&
                r.data &&
                !(r.data as { removedFromDeployment: boolean }).removedFromDeployment
                ? t("removedLocal")
                : t("removed"),
            );
          })
        }
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}

function EnvVarDialog({
  slug,
  existing,
  onClose,
  onResult,
}: {
  slug: string;
  existing: EnvVarView | null;
  onClose: () => void;
  onResult: (r: Result) => void;
}) {
  const t = useTranslations("studio.env");
  const id = useId();
  const [pending, start] = useTransition();
  const [name, setName] = useState(existing?.name ?? "");
  const [secret, setSecret] = useState(existing?.secret ?? true);
  const [clear, setClear] = useState<Set<Env>>(new Set());
  const publicName = isPublicName(name);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (env: Env) => String(form.get(env) ?? "");
    start(async () =>
      onResult(
        await saveEnvVarAction(slug, {
          name: name.trim(),
          secret: publicName ? false : secret,
          comment: String(form.get("comment") ?? ""),
          production: value("production"),
          preview: value("preview"),
          development: value("development"),
          clear: [...clear],
        }),
      ),
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={existing ? t("dialogEdit", { name: existing.name }) : t("dialogAdd")}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1.5 block text-sm font-medium">
            {t("name")}
          </label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            disabled={Boolean(existing)}
            required
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            className={cn(FIELD_CLASS, "min-h-11 font-mono sm:min-h-9")}
            aria-describedby={`${id}-name-hint`}
          />
          <p id={`${id}-name-hint`} className="mt-1 text-xs text-subtle-foreground">
            {t("nameHint")}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-comment`} className="mb-1.5 block text-sm font-medium">
            {t("comment")}
          </label>
          <input
            id={`${id}-comment`}
            name="comment"
            defaultValue={existing?.comment ?? ""}
            maxLength={200}
            className={cn(FIELD_CLASS, "min-h-11 sm:min-h-9")}
          />
        </div>
        <label className="flex min-h-11 items-start gap-2 text-sm sm:min-h-0">
          <input
            type="checkbox"
            checked={publicName ? false : secret}
            disabled={publicName}
            onChange={(e) => setSecret(e.target.checked)}
            className="mt-1"
          />
          <span>
            {t("isSecret")}
            {publicName ? (
              <span className="block text-xs text-subtle-foreground">{t("publicHint")}</span>
            ) : null}
          </span>
        </label>
        {ENVIRONMENTS.map((env) => {
          const filled = existing?.filled[env] ?? false;
          return (
            <div key={env}>
              <label htmlFor={`${id}-${env}`} className="mb-1.5 block text-sm font-medium">
                {t("value", { env: t(`env.${env}`) })}
              </label>
              <input
                id={`${id}-${env}`}
                name={env}
                type="password"
                autoComplete="off"
                maxLength={4000}
                placeholder={filled && !clear.has(env) ? t("filledKeep") : t("valuePlaceholder")}
                disabled={clear.has(env)}
                className={cn(FIELD_CLASS, "min-h-11 font-mono sm:min-h-9")}
              />
              {filled ? (
                <label className="mt-1 flex min-h-11 items-center gap-2 text-xs text-muted-foreground sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={clear.has(env)}
                    onChange={(e) =>
                      setClear((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(env);
                        else next.delete(env);
                        return next;
                      })
                    }
                  />
                  {t("clear", { env: t(`env.${env}`) })}
                </label>
              ) : null}
            </div>
          );
        })}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="min-h-11 sm:min-h-9" disabled={pending || !name.trim()}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ImportDialog({
  slug,
  onClose,
  onResult,
}: {
  slug: string;
  onClose: () => void;
  onResult: (r: Result) => void;
}) {
  const t = useTranslations("studio.env");
  const id = useId();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [targets, setTargets] = useState<Set<Env>>(new Set(["preview", "development"]));
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const failure = useTranslations("studio.errors");
  const app = useTranslations("app.errors");

  function run(e: FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await importEnvAction(slug, { text, environments: [...targets], overwrite });
      if (!r.ok) {
        const field = r.fields ? Object.values(r.fields)[0] : undefined;
        setError(
          field && failure.has(field as never)
            ? failure(field as never)
            : app.has(r.code as never)
              ? app(r.code as never)
              : app("INTERNAL_ERROR"),
        );
        return;
      }
      setSummary(r.data as ImportSummary);
      setText("");
      onResult(r);
    });
  }

  return (
    <Dialog open onClose={onClose} title={t("importTitle")} description={t("importHint")}>
      {summary ? (
        <div className="space-y-3 text-sm" aria-live="polite">
          <Notice tone="success">
            {t("importDone", {
              added: summary.added.length,
              updated: summary.updated.length,
              kept: summary.kept.length,
            })}
          </Notice>
          {summary.skipped.length > 0 ? (
            <Notice tone="warning">
              {t("importSkipped", { names: summary.skipped.join(", ") })}
            </Notice>
          ) : null}
          {summary.invalid.length > 0 ? (
            <Notice tone="warning">
              {t("importInvalid", {
                count: summary.invalid.length,
                lines: summary.invalid.map((i) => i.line).join(", "),
              })}
            </Notice>
          ) : null}
          <Button className="min-h-11 w-full sm:min-h-9 sm:w-auto" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <form onSubmit={run} className="space-y-4">
          <div>
            <label htmlFor={`${id}-text`} className="mb-1.5 block text-sm font-medium">
              {t("importText")}
            </label>
            <textarea
              id={`${id}-text`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              spellCheck={false}
              autoComplete="off"
              placeholder={"API_KEY=\\nNEXT_PUBLIC_MAP_STYLE=dark"}
              className={cn(FIELD_CLASS, "font-mono text-xs")}
            />
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t("importTo")}</legend>
            <div className="flex flex-wrap gap-x-4">
              {ENVIRONMENTS.map((env) => (
                <label key={env} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-8">
                  <input
                    type="checkbox"
                    checked={targets.has(env)}
                    onChange={(e) =>
                      setTargets((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(env);
                        else next.delete(env);
                        return next;
                      })
                    }
                  />
                  {t(`env.${env}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-8">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            {t("overwrite")}
          </label>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              className="min-h-11 sm:min-h-9"
              disabled={pending || !text.trim() || targets.size === 0}
            >
              {pending ? t("importing") : t("importRun")}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
