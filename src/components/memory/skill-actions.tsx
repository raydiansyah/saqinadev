"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approveSkillAction,
  archiveSkillAction,
  deleteSkillAction,
  rejectSkillAction,
  restoreSkillAction,
  setSkillVisibilityAction,
  skillFeedbackAction,
} from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Notice, Select } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import type { AssetStatus, Visibility } from "@/lib/domain/memory";

type Result = { ok: boolean; code?: string; data?: unknown };

function useRun() {
  const errors = useTranslations("app.errors");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(errors((r.code ?? "INTERNAL_ERROR") as "INTERNAL_ERROR"));
      else after?.(r);
    });
  };
  return { pending, error, notice, setNotice, run };
}

/** Review decision for a skill waiting for a person: choose who may use it, or reject it. */
export function SkillReviewActions({
  slug,
  assetId,
  version,
  isOwner,
  admin,
}: {
  slug: string;
  assetId: string;
  /** The version the reviewer is looking at: approval is pinned to it. */
  version: number;
  isOwner: boolean;
  admin: boolean;
}) {
  const t = useTranslations("memoryHub.skills");
  const v = useTranslations("memoryHub.visibility");
  const { pending, error, run } = useRun();
  const [visibility, setVisibility] = useState<"private" | "project">(
    admin ? "project" : "private",
  );
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4" aria-busy={pending}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Select
          id={`skill-vis-${assetId}`}
          label={t("approveAs")}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          className="sm:w-56"
        >
          {admin ? <option value="project">{v("project")}</option> : null}
          {isOwner ? <option value="private">{v("private")}</option> : null}
        </Select>
        <Button
          disabled={pending}
          onClick={() => run(() => approveSkillAction(slug, { id: assetId, version, visibility }))}
        >
          {t("approve")}
        </Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => run(() => rejectSkillAction(slug, { id: assetId, version }))}
        >
          {t("reject")}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

/** Everything a manager can do with one skill, plus the "did it work?" feedback. */
export function SkillActions({
  slug,
  assetId,
  version,
  status,
  visibility,
  isOwner,
  admin,
  manage,
}: {
  slug: string;
  assetId: string;
  version: number;
  status: AssetStatus;
  visibility: Visibility;
  isOwner: boolean;
  admin: boolean;
  manage: boolean;
}) {
  const t = useTranslations("memoryHub.skills");
  const v = useTranslations("memoryHub.visibility");
  const router = useRouter();
  const { pending, error, notice, setNotice, run } = useRun();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="space-y-6" aria-busy={pending}>
      {status === "approved" ? (
        <section aria-labelledby="feedback" className="space-y-2">
          <h2 id="feedback" className="text-sm font-medium text-muted-foreground">
            {t("feedback.title")}
          </h2>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={t("feedback.note")}
            aria-label={t("feedback.note")}
            className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-[0.9375rem] sm:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {(["success", "partial", "failure"] as const).map((outcome) => (
              <Button
                key={outcome}
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      skillFeedbackAction(slug, { id: assetId, outcome, note: note || undefined }),
                    () => {
                      setNote("");
                      setNotice(t("feedback.sent"));
                    },
                  )
                }
              >
                {t(
                  `feedback.${outcome === "success" ? "worked" : outcome === "partial" ? "partial" : "failed"}`,
                )}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {manage ? (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap gap-2">
            {status === "pending_review" && admin ? (
              <Button
                disabled={pending}
                onClick={() =>
                  run(() =>
                    approveSkillAction(slug, {
                      id: assetId,
                      version,
                      visibility: visibility === "private" ? "project" : visibility,
                    }),
                  )
                }
              >
                {t("approve")}
              </Button>
            ) : null}
            {status === "approved" ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => archiveSkillAction(slug, { id: assetId }))}
              >
                {t("archive")}
              </Button>
            ) : null}
            {status === "archived" ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => restoreSkillAction(slug, { id: assetId }))}
              >
                {t("restore")}
              </Button>
            ) : null}
            <Button variant="danger" disabled={pending} onClick={() => setConfirming(true)}>
              {t("delete")}
            </Button>
          </div>
          <Select
            id="skill-visibility"
            label={t("changeVisibility")}
            value={visibility}
            disabled={pending}
            onChange={(e) =>
              run(
                () => setSkillVisibilityAction(slug, { id: assetId, visibility: e.target.value }),
                (r) => {
                  const data = r.data as { result?: string } | undefined;
                  if (data?.result === "requested") setNotice(t("visibilityRequested"));
                },
              )
            }
            className="sm:w-64"
          >
            <option value="project">{v("project")}</option>
            {isOwner ? <option value="private">{v("private")}</option> : null}
            {visibility === "restricted" ? (
              <option value="restricted">{v("restricted")}</option>
            ) : null}
            {visibility === "agent" ? <option value="agent">{v("agent")}</option> : null}
          </Select>
        </section>
      ) : null}

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <ConfirmDialog
        open={confirming}
        title={t("deleteTitle")}
        body={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        pending={pending}
        error={error}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          run(
            () => deleteSkillAction(slug, { id: assetId }),
            () => router.push(`/project/${slug}/memory/skills`),
          )
        }
      />
    </div>
  );
}
