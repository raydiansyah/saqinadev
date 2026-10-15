"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { getDocConflictAction } from "@/app/[locale]/(app)/project/[slug]/documents/actions";
import { resolveDocConflictAction } from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import { Dialog } from "@/components/app/dialog";
import { ChangePreview } from "@/components/assistant/blocks/change-preview";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";

export type ConflictKind = "conflict" | "remote_missing";

/**
 * Compare dialog for a document whose repository file changed on both sides (or was removed).
 * Resolving closes the dialog and refreshes the page data.
 */
export function ConflictDialog({
  open,
  onClose,
  projectSlug,
  documentId,
  docSlug,
  kind,
  saqina,
  path,
}: {
  open: boolean;
  onClose: () => void;
  projectSlug: string;
  documentId: string;
  docSlug: string;
  kind: ConflictKind;
  /** The current Saqina text. */
  saqina: string;
  path: string;
}) {
  const t = useTranslations("documents");
  const errors = useTranslations("app.errors");
  const router = useRouter();
  const [remote, setRemote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const file = `${docSlug.toUpperCase()}.md`;
  const missing = kind === "remote_missing";

  // The repository text is only fetched for a real conflict, each time the dialog opens.
  useEffect(() => {
    if (!open || missing) return;
    let cancelled = false;
    setRemote(null);
    setError(null);
    getDocConflictAction(projectSlug, documentId).then((result) => {
      if (cancelled) return;
      if (result.ok) setRemote(result.data.remote);
      else setError(errors(result.code));
    });
    return () => {
      cancelled = true;
    };
  }, [open, missing, projectSlug, documentId, errors]);

  function resolve(keep: "saqina" | "repo") {
    setError(null);
    startTransition(async () => {
      const result = await resolveDocConflictAction(projectSlug, { docSlug, keep });
      if (!result.ok) {
        setError(errors(result.code));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={missing ? t("sync.dialog.missingTitle") : t("sync.dialog.title")}
      description={t(missing ? "sync.dialog.missingExplain" : "sync.dialog.explain", { file })}
      className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto"
    >
      <div className="space-y-4">
        <p className="font-mono text-xs break-all text-muted-foreground">
          {t("sync.path", { path })}
        </p>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {missing ? null : remote === null ? (
          error ? null : (
            <p role="status" className="text-sm text-muted-foreground">
              {t("sync.dialog.loading")}
            </p>
          )
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <TextPane label={t("sync.dialog.saqina")} text={saqina} />
              <TextPane label={t("sync.dialog.repo")} text={remote} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t("sync.dialog.diff")}
              </p>
              <ChangePreview before={saqina} after={remote} label={t("sync.dialog.diff")} />
            </div>
          </div>
        )}

        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Button
              className="w-full whitespace-normal"
              disabled={pending}
              onClick={() => resolve("saqina")}
            >
              {t("sync.dialog.keepSaqina")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t(missing ? "sync.dialog.keepSaqinaMissingHint" : "sync.dialog.keepSaqinaHint")}
            </p>
          </div>
          {missing ? null : (
            <div className="space-y-1.5">
              <Button
                variant="outline"
                className="w-full whitespace-normal"
                disabled={pending || remote === null}
                onClick={() => resolve("repo")}
              >
                {t("sync.dialog.useRepo")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("sync.dialog.useRepoHint")}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("sync.dialog.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TextPane({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <pre
        tabIndex={0}
        aria-label={label}
        className="max-h-56 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
      >
        {text}
      </pre>
    </div>
  );
}
