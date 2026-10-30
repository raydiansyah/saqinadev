"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { refreshDeploymentsAction } from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { useExecutionContext } from "./context";

/**
 * The preview of the work branch. There is one frame: when a newer build is ready its address
 * changes, the frame is not made again, and the last preview stays up while the next one builds.
 * When there is no preview, or it failed, this says which and what to check.
 */
export function ExecutionPreview() {
  const t = useTranslations("studio.execution.preview");
  const locale = useLocale();
  const { slug, delivery, want } = useExecutionContext();
  const [checking, startCheck] = useTransition();
  useEffect(() => want("delivery"), [want]);
  const preview = delivery.data?.preview ?? null;

  // The address of the last build that was ready. A build in progress or a failure does not replace it.
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (preview?.url) setShown(preview.url);
  }, [preview?.url]);

  const check = () =>
    startCheck(async () => {
      await refreshDeploymentsAction(slug);
      delivery.refetch();
    });

  return (
    <section aria-labelledby="exec-preview-title" className="mb-6 space-y-3">
      <h3
        id="exec-preview-title"
        className="font-mono text-xs uppercase tracking-wider text-subtle-foreground"
      >
        {t("title")}
      </h3>
      {!preview && delivery.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("reading")}
        </p>
      ) : null}
      {preview?.status === "no_commits" ? (
        <p className="text-sm text-muted-foreground">{t("noCommits")}</p>
      ) : null}
      {preview?.status === "none_yet" ? (
        <div className="space-y-2 text-sm">
          <p>{t("noneYet")}</p>
          <p className="text-xs text-muted-foreground">{t("noneYetHint")}</p>
        </div>
      ) : null}
      {preview?.status === "pending" ? (
        <p role="status" className="text-sm">
          {t("building")}
        </p>
      ) : null}
      {preview?.status === "failed" ? (
        <div role="alert" className="space-y-1 rounded-md border border-error/40 p-3 text-sm">
          <p>{t("failed")}</p>
          <p className="text-xs text-muted-foreground">{t("failedHint")}</p>
        </div>
      ) : null}
      {preview && ["none_yet", "pending", "failed"].includes(preview.status) ? (
        <Button size="sm" variant="outline" disabled={checking} onClick={check}>
          {t("check")}
        </Button>
      ) : null}

      {shown ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {preview?.updatedAt
                ? t("updated", { when: formatRelative(new Date(preview.updatedAt), locale) })
                : ""}
            </span>
            <a
              href={shown}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {t("openNew")}
            </a>
          </div>
          {/* Another origin: scripts run, but it cannot touch Saqina or navigate it. */}
          <iframe
            title={t("frame")}
            src={shown}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
            className="min-h-[18rem] w-full rounded-md border border-border bg-white"
          />
        </div>
      ) : null}
    </section>
  );
}
