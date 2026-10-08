"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  connectRepositoryAction,
  disconnectRepositoryAction,
  syncRepositoryAction,
} from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select } from "@/components/ui/form";
import { GIT_PROVIDERS } from "@/lib/domain/enums";
import { formatRelative } from "@/lib/format";
import type { RepositoryView } from "@/lib/git/service";

/** Repository connection. The token is write-only; only its presence is ever shown. */
export function RepositoryPanel({
  slug,
  repo,
  canManage,
  localAllowed,
}: {
  slug: string;
  repo: RepositoryView | null;
  canManage: boolean;
  localAllowed: boolean;
}) {
  const t = useTranslations("integrations.repository");
  const locale = useLocale();
  const id = useId();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(!repo || repo.status === "disconnected");
  const { pending, error, run } = useRun();
  const connected = repo && repo.status !== "disconnected";

  return (
    <section aria-labelledby={`${id}-repo`} className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-repo`} className="font-semibold">
          {t("title")}
        </h2>
        {repo ? (
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs">
            {t(`statuses.${repo.status}`)}
          </span>
        ) : null}
      </div>
      {connected ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted-foreground">{t("provider")}: </dt>
            <dd className="inline">{t(`providers.${repo.provider}`)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="inline text-muted-foreground">{t("fullName")}: </dt>
            <dd className="inline break-all font-mono text-xs">{repo.fullName}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">{t("defaultBranch")}: </dt>
            <dd className="inline font-mono text-xs">{repo.defaultBranch}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">{t("head")}: </dt>
            <dd className="inline font-mono text-xs">{repo.headSha?.slice(0, 10) ?? "?"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="inline text-muted-foreground">{t("detected")}: </dt>
            <dd className="inline">
              {Object.entries(repo.detectedStack)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ") || "-"}
            </dd>
          </div>
          {repo.lastSyncedAt ? (
            <p className="text-xs text-subtle-foreground sm:col-span-2">
              {t("lastSynced", { time: formatRelative(new Date(repo.lastSyncedAt), locale) })}
            </p>
          ) : null}
          {repo.lastError ? (
            <Notice tone="error" className="sm:col-span-2">
              {t("failed", { reason: repo.lastError })}
            </Notice>
          ) : null}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("none")}</p>
      )}
      {canManage && connected && !editing ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => syncRepositoryAction(slug, {}))}
          >
            {t("sync")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t("reconnect")}
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
            {t("disconnect")}
          </Button>
        </div>
      ) : null}
      {canManage && editing ? (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          action={(form) =>
            run(
              () =>
                connectRepositoryAction(slug, {
                  provider: String(form.get("provider")),
                  fullName: String(form.get("fullName") ?? ""),
                  baseUrl: String(form.get("baseUrl") ?? "") || null,
                  token: String(form.get("token") ?? "") || undefined,
                  developmentBranch: String(form.get("developmentBranch") ?? "") || null,
                  agentBranchPrefix: String(form.get("prefix") ?? "") || "saqina/",
                }),
              () => setEditing(false),
            )
          }
        >
          <Select
            id={`${id}-provider`}
            name="provider"
            label={t("provider")}
            defaultValue={repo?.provider ?? "github"}
          >
            {GIT_PROVIDERS.filter((p) => p !== "custom_local" || localAllowed).map((p) => (
              <option key={p} value={p} disabled={p === "bitbucket"}>
                {t(`providers.${p}`)}
              </option>
            ))}
          </Select>
          <Field
            id={`${id}-name`}
            name="fullName"
            label={t("fullName")}
            hint={t("fullNameHint")}
            defaultValue={repo?.fullName}
            required
            maxLength={300}
          />
          <Field
            id={`${id}-token`}
            name="token"
            type="password"
            autoComplete="off"
            label={t("token")}
            hint={t("tokenHint")}
            maxLength={500}
          />
          <Field id={`${id}-base`} name="baseUrl" label={t("baseUrl")} maxLength={300} />
          <Field
            id={`${id}-dev`}
            name="developmentBranch"
            label={t("developmentBranch")}
            defaultValue={repo?.developmentBranch ?? ""}
            maxLength={120}
          />
          <Field
            id={`${id}-prefix`}
            name="prefix"
            label={t("prefix")}
            hint={t("prefixHint")}
            defaultValue={repo?.agentBranchPrefix ?? "saqina/"}
            maxLength={40}
          />
          <div className="sm:col-span-2">
            <FormError error={error} />
            <Button className="mt-2" type="submit" disabled={pending}>
              {connected ? t("reconnect") : t("connect")}
            </Button>
          </div>
        </form>
      ) : (
        <FormError error={error} />
      )}
      <ConfirmDialog
        open={confirm}
        title={t("disconnectTitle")}
        body={t("disconnectBody")}
        confirmLabel={t("disconnect")}
        pending={pending}
        onConfirm={() =>
          run(
            () => disconnectRepositoryAction(slug, {}),
            () => setConfirm(false),
          )
        }
        onClose={() => setConfirm(false)}
      />
    </section>
  );
}
