"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import type { RewindPreview } from "./types";

const UNDO_KEY: Record<string, string> = {
  "task.created": "taskCreated",
  "task.updated": "taskUpdated",
  "requirement.created": "requirementCreated",
  "requirement.updated": "requirementUpdated",
  "document.edited": "documentEdited",
};

/**
 * Asks before going back. It first shows exactly what would happen: how many messages are
 * hidden, which project changes are put back, and, if anything cannot be put back, why. A
 * blocked rewind offers a fork instead, because a fork never touches the project.
 */
export function RewindDialog({
  messageId,
  onClose,
  preview,
  rewind,
  fork,
}: {
  /** The message to go back to; null keeps the dialog closed. */
  messageId: string | null;
  onClose: () => void;
  preview: (messageId: string) => Promise<RewindPreview | null>;
  rewind: (messageId: string) => Promise<{ applied: boolean; plan: RewindPreview } | null>;
  fork: (messageId: string) => Promise<unknown>;
}) {
  const t = useTranslations("assistant.rewind");
  // Keys such as `undo.task.created` or `kinds.CREATE_INVOICE` are built from server values.
  const dynamic = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const [plan, setPlan] = useState<RewindPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `preview` changes with the thread
  useEffect(() => {
    setPlan(null);
    if (!messageId) return;
    let cancelled = false;
    setLoading(true);
    void preview(messageId).then((result) => {
      if (cancelled) return;
      setPlan(result);
      setLoading(false);
      if (!result) onClose();
    });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  const blocked = (plan?.blockers.length ?? 0) > 0;
  const kind = (value: string) =>
    t.has(`kinds.${value}` as never) ? dynamic(`kinds.${value}`) : dynamic("kinds.unknown");

  const confirm = async () => {
    if (!messageId) return;
    setWorking(true);
    const result = await rewind(messageId);
    setWorking(false);
    if (!result) return onClose();
    // Someone changed something between the preview and the click: show the new answer.
    if (result.applied) onClose();
    else setPlan(result.plan);
  };

  return (
    <Dialog
      open={messageId !== null}
      onClose={onClose}
      title={blocked ? t("blockedTitle") : t("title")}
      description={blocked ? undefined : t("description")}
    >
      {loading || !plan ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("checking")}
        </p>
      ) : (
        <div className="space-y-4 text-sm">
          {blocked ? (
            <>
              <p className="text-muted-foreground">{t("blockedBody")}</p>
              <ul className="space-y-1.5">
                {plan.blockers.map((b, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list shown once
                    key={i}
                    className="rounded-md border border-border px-3 py-2"
                  >
                    <span className="font-medium">{kind(b.kind)}</span>
                    {b.label ? <span className="text-muted-foreground">: {b.label}</span> : null}
                    <span className="block text-xs text-subtle-foreground">
                      {t(`reason.${b.reason}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <ul className="space-y-1 text-muted-foreground">
                <li>{t("messages", { count: plan.removedMessages })}</li>
                {plan.cancelledProposals > 0 ? (
                  <li>{t("proposals", { count: plan.cancelledProposals })}</li>
                ) : null}
              </ul>
              {plan.undo.length > 0 ? (
                <div>
                  <p className="font-medium">{t("undoTitle")}</p>
                  <ul className="mt-1.5 space-y-1">
                    {plan.undo.map((u, i) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list shown once
                        key={i}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        {dynamic(`undo.${UNDO_KEY[u.op] ?? "documentEdited"}`, { label: u.label })}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("nothingToUndo")}</p>
              )}
            </>
          )}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            {messageId ? (
              <Button
                variant="outline"
                onClick={async () => {
                  setWorking(true);
                  await fork(messageId);
                  setWorking(false);
                  onClose();
                }}
                disabled={working}
              >
                {t("fork")}
              </Button>
            ) : null}
            {blocked ? null : (
              <Button variant="danger" onClick={() => void confirm()} disabled={working}>
                {t("confirm")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
