"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approveMemoryAction,
  rejectMemoryAction,
} from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { Button } from "@/components/ui/button";
import { Notice, Select } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { MemoryConfidence, MemoryKind } from "@/lib/domain/memory";

export interface ReviewCardData {
  assetId: string;
  title: string;
  content: string;
  kind: MemoryKind;
  confidence: MemoryConfidence;
  sourceLabels: string[];
  conflict: { id: string; title: string; content: string } | null;
  /** Whether the viewer owns the asset; only then may it stay private. */
  canKeepPrivate: boolean;
}

/** One suggestion waiting for a person: approve (choosing who can read it) or reject. */
export function ReviewCard({ slug, item }: { slug: string; item: ReviewCardData }) {
  const t = useTranslations("memoryHub");
  const errors = useTranslations("app.errors");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"private" | "project">("project");
  const [onConflict, setOnConflict] = useState<"supersede" | "keep_both" | "">("");

  function run(action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveMemoryAction(slug, {
              id: item.assetId,
              visibility,
              onConflict: onConflict || undefined,
            })
          : await rejectMemoryAction(slug, { id: item.assetId });
      if (!result.ok) {
        setError(result.fields?.onConflict ? t("review.needsChoice") : errors(result.code));
      }
    });
  }

  return (
    <article className="rounded-lg border border-border bg-surface p-4" aria-busy={pending}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium text-pretty">{item.title}</h3>
        <span className="flex gap-2 font-mono text-xs text-muted-foreground">
          <span className="rounded-md border border-border-strong px-2 py-0.5">
            {t(`kind.${item.kind}`)}
          </span>
          <span className="rounded-md border border-border-strong px-2 py-0.5">
            {t(`confidence.${item.confidence}`)}
          </span>
        </span>
      </div>
      <p className="mt-2 text-sm whitespace-pre-line text-pretty text-muted-foreground">
        {item.content}
      </p>
      <p className="mt-2 text-xs text-subtle-foreground">
        {t("review.sources")}:{" "}
        {item.sourceLabels.length ? item.sourceLabels.join(", ") : t("review.noSources")}
      </p>

      {item.conflict ? (
        <div className="mt-3 rounded-md border border-warning/50 p-3 text-sm">
          <p className="font-medium text-warning">{t("review.conflict")}</p>
          <p className="mt-1 text-muted-foreground">
            {item.conflict.title}: {item.conflict.content}
          </p>
          <Select
            id={`conflict-${item.assetId}`}
            label={t("review.conflictChoice")}
            value={onConflict}
            onChange={(e) => setOnConflict(e.target.value as typeof onConflict)}
            className="mt-2"
          >
            <option value="" disabled>
              —
            </option>
            <option value="supersede">{t("review.supersede")}</option>
            <option value="keep_both">{t("review.keepBoth")}</option>
          </Select>
        </div>
      ) : null}

      {error ? (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
        <Select
          id={`vis-${item.assetId}`}
          label={t("review.approveAs")}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          className="sm:w-56"
        >
          <option value="project">{t("visibility.project")}</option>
          {item.canKeepPrivate ? <option value="private">{t("visibility.private")}</option> : null}
        </Select>
        <Button onClick={() => run("approve")} disabled={pending}>
          {t("review.approve")}
        </Button>
        <Button variant="danger" onClick={() => run("reject")} disabled={pending}>
          {t("review.reject")}
        </Button>
        <Link
          href={`/project/${slug}/memory/${item.assetId}`}
          className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground sm:ml-auto"
        >
          {t("review.open")}
        </Link>
      </div>
    </article>
  );
}
