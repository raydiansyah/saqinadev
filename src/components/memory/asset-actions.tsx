"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  archiveMemoryAction,
  changeVisibilityAction,
  deleteMemoryAction,
  restoreMemoryAction,
  setLevelAction,
} from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Notice, Select } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import type { AssetStatus, MemoryLevel, Visibility } from "@/lib/domain/memory";

/** What a person can do with one memory, according to what the server says they may manage. */
export function AssetActions({
  slug,
  assetId,
  status,
  level,
  visibility,
  isOwner,
}: {
  slug: string;
  assetId: string;
  status: AssetStatus;
  level: MemoryLevel;
  visibility: Visibility;
  isOwner: boolean;
}) {
  const t = useTranslations("memoryHub");
  const errors = useTranslations("app.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; code?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(errors((result.code ?? "INTERNAL_ERROR") as "INTERNAL_ERROR"));
      else after?.();
    });
  }

  const approved = status === "approved";
  return (
    <div className="space-y-4" aria-busy={pending}>
      <div className="flex flex-wrap gap-2">
        {approved ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => setLevelAction(slug, { id: assetId, level: level === "L3" ? "L1" : "L3" }))
            }
          >
            {level === "L3" ? t("detail.unpin") : t("detail.pin")}
          </Button>
        ) : null}
        {approved ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => archiveMemoryAction(slug, { id: assetId }))}
          >
            {t("detail.archive")}
          </Button>
        ) : null}
        {status === "archived" ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => restoreMemoryAction(slug, { id: assetId }))}
          >
            {t("detail.restore")}
          </Button>
        ) : null}
        <Button variant="danger" disabled={pending} onClick={() => setConfirming(true)}>
          {t("detail.delete")}
        </Button>
      </div>

      <Select
        id="visibility"
        label={t("detail.changeVisibility")}
        value={visibility}
        disabled={pending}
        onChange={(e) =>
          run(() => changeVisibilityAction(slug, { id: assetId, visibility: e.target.value }))
        }
        className="sm:w-64"
      >
        <option value="project">{t("visibility.project")}</option>
        {isOwner ? <option value="private">{t("visibility.private")}</option> : null}
        {visibility === "restricted" ? (
          <option value="restricted">{t("visibility.restricted")}</option>
        ) : null}
        {visibility === "agent" ? <option value="agent">{t("visibility.agent")}</option> : null}
      </Select>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <ConfirmDialog
        open={confirming}
        title={t("detail.deleteTitle")}
        body={t("detail.deleteBody")}
        confirmLabel={t("detail.deleteConfirm")}
        pending={pending}
        error={error}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          run(
            () => deleteMemoryAction(slug, { id: assetId }),
            () => router.push(`/project/${slug}/memory`),
          )
        }
      />
    </div>
  );
}
