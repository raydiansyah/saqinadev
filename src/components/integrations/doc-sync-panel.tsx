"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  configureDocSyncAction,
  syncDocsNowAction,
} from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Field, Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { DocSyncStatus } from "@/lib/docsync/config";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SyncResult {
  pushed: number;
  pulled: number;
  created: number;
  conflicts: number;
  skipped?: "disabled" | "busy" | "unsupported" | "clean";
  error?: string;
}

const GIT_ERRORS = [
  "rate_limited",
  "auth_failed",
  "not_found",
  "too_large",
  "network",
  "provider_error",
] as const;

/** Read-only value with a copy button; long values wrap instead of overflowing. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const t = useTranslations("integrations");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <input
        readOnly
        aria-label={label}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(FIELD_CLASS, "min-h-11 min-w-0 flex-1 basis-60 py-2 font-mono text-xs")}
      />
      <Button
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
      >
        {copied ? t("docSync.copied") : t("docSync.copy")}
      </Button>
    </div>
  );
}

/** Two-way document sync with the project's GitHub repository. */
export function DocSyncPanel({
  slug,
  status,
  canManage,
}: {
  slug: string;
  status: DocSyncStatus;
  canManage: boolean;
}) {
  const t = useTranslations("integrations");
  const locale = useLocale();
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const [secret, setSecret] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [folderInvalid, setFolderInvalid] = useState(false);

  if (status.provider !== "github") {
    return (
      <section aria-labelledby={`${id}-ds`} className="rounded-lg border border-border p-5">
        <h2 id={`${id}-ds`} className="font-semibold">
          {t("docSync.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("docSync.unsupported")}</p>
      </section>
    );
  }

  const errorText = (code: string) =>
    (GIT_ERRORS as readonly string[]).includes(code)
      ? t(`docSync.errors.${code as (typeof GIT_ERRORS)[number]}`)
      : t("docSync.errors.unknown");

  const configure = (input: { enabled: boolean; docsPath?: string; rotateSecret?: boolean }) => {
    setFolderInvalid(false);
    setResult(null);
    run<{ webhookSecret?: string }>(
      async () => {
        const res = await configureDocSyncAction(slug, input);
        if (!res.ok && res.fields?.docsPath === "invalid") setFolderInvalid(true);
        return res;
      },
      (data) => {
        setConfirmRotate(false);
        // The secret exists only in this response; it is never read from the server again.
        setSecret(input.enabled ? (data?.webhookSecret ?? null) : null);
      },
    );
  };

  const syncNow = () => {
    setResult(null);
    run<SyncResult>(
      () => syncDocsNowAction(slug, undefined),
      (data) => setResult(data),
    );
  };

  const outcome = result?.skipped
    ? t(`docSync.skipped.${result.skipped}`)
    : result
      ? t("docSync.summary", {
          pushed: result.pushed,
          pulled: result.pulled,
          created: result.created,
          conflicts: result.conflicts,
        })
      : null;

  return (
    <section aria-labelledby={`${id}-ds`} className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-ds`} className="font-semibold">
          {t("docSync.title")}
        </h2>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs">
          {status.enabled ? t("docSync.statusOn") : t("docSync.statusOff")}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t("docSync.intro")}</p>

      {!status.enabled ? (
        canManage ? (
          <form
            className="mt-4 grid gap-4 sm:max-w-md"
            action={(form) =>
              configure({ enabled: true, docsPath: String(form.get("docsPath") ?? "").trim() })
            }
          >
            <Field
              id={`${id}-path`}
              name="docsPath"
              label={t("docSync.folder")}
              placeholder={t("docSync.folderPlaceholder")}
              hint={t("docSync.folderHint")}
              defaultValue={status.docsPath || "docs"}
              error={folderInvalid ? t("docSync.folderInvalid") : undefined}
              maxLength={100}
              autoComplete="off"
            />
            <div>
              <Button type="submit" disabled={pending}>
                {t("docSync.turnOn")}
              </Button>
              {folderInvalid ? null : <FormError error={error} />}
            </div>
          </form>
        ) : null
      ) : (
        <>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm">
            <div className="min-w-0">
              <dt className="inline text-muted-foreground">{t("docSync.folderLabel")}: </dt>
              <dd className="inline break-all font-mono text-xs">{status.docsPath}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-subtle-foreground">
            {status.syncedAt
              ? t("docSync.lastSynced", {
                  time: formatRelative(new Date(status.syncedAt), locale),
                })
              : t("docSync.neverSynced")}
          </p>
          <div className="mt-3 space-y-1 text-sm">
            {status.pending > 0 ? (
              <p>
                {t("docSync.pending", { count: status.pending })}
                {status.prUrl ? (
                  <>
                    {" "}
                    <a
                      href={status.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline underline-offset-2"
                    >
                      {t("docSync.openPr")}
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            {status.conflicts > 0 ? (
              <p className="text-warning">
                {t("docSync.conflicts", { count: status.conflicts })}{" "}
                <Link href={`/project/${slug}/documents`} className="underline underline-offset-2">
                  {t("docSync.resolveConflicts")}
                </Link>
              </p>
            ) : null}
          </div>
          {status.error ? (
            <Notice tone="error" className="mt-3 break-words">
              {t("docSync.errorPrefix", { reason: errorText(status.error) })}
            </Notice>
          ) : null}
          {result?.error && result.error !== status.error ? (
            <Notice tone="error" className="mt-3 break-words">
              {t("docSync.errorPrefix", { reason: errorText(result.error) })}
            </Notice>
          ) : outcome ? (
            <Notice tone="success" className="mt-3">
              {outcome}
            </Notice>
          ) : null}

          {canManage ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={syncNow}>
                {t("docSync.syncNow")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirmRotate(true)}
              >
                {t("docSync.rotate")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => configure({ enabled: false })}
              >
                {t("docSync.turnOff")}
              </Button>
            </div>
          ) : null}
          <FormError error={error} />

          <div className="mt-5 min-w-0 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t("docSync.webhook")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("docSync.webhookIntro")}</p>
            <p className="mt-3 mb-1.5 text-sm font-medium">{t("docSync.webhookUrl")}</p>
            <CopyValue value={status.webhookUrl} label={t("docSync.webhookUrl")} />
            {secret ? (
              <div
                role="status"
                className="mt-4 min-w-0 rounded-md border border-warning/50 bg-surface px-4 py-3"
              >
                <p className="text-sm font-medium">{t("docSync.secretTitle")}</p>
                <p className="mt-1 mb-2 text-sm text-warning">{t("docSync.secretWarning")}</p>
                <CopyValue value={secret} label={t("docSync.secretTitle")} />
                <div className="mt-3">
                  <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>
                    {t("docSync.secretDismiss")}
                  </Button>
                </div>
              </div>
            ) : canManage ? (
              <p className="mt-3 text-xs text-subtle-foreground">{t("docSync.secretMissing")}</p>
            ) : null}
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t("docSync.steps.open")}</li>
              <li>{t("docSync.steps.url")}</li>
              <li>{t("docSync.steps.type")}</li>
              <li>{t("docSync.steps.secret")}</li>
              <li>{t("docSync.steps.events")}</li>
            </ol>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmRotate}
        title={t("docSync.rotateTitle")}
        body={t("docSync.rotateBody")}
        confirmLabel={t("docSync.rotateConfirm")}
        pending={pending}
        onConfirm={() => configure({ enabled: true, rotateSecret: true })}
        onClose={() => {
          setConfirmRotate(false);
          clear();
        }}
      />
    </section>
  );
}
