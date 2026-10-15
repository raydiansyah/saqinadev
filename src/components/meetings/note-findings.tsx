"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  dismissItemsAction,
  proposeNoteAction,
} from "@/app/[locale]/(app)/project/[slug]/meetings/actions";
import { Chip, type ChipTone } from "@/components/engagement/chip";
import { EngagementError } from "@/components/engagement/engagement-error";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { MeetingItemClass, MeetingMatchType } from "@/lib/domain/business";

export interface ItemView {
  id: string;
  text: string;
  quote: string;
  classification: MeetingItemClass;
  confidence: number;
  rationale: string;
  matchedType: MeetingMatchType | null;
  proposed: boolean;
  dismissed: boolean;
}

const CLASS_TONE: Record<MeetingItemClass, ChipTone> = {
  new_in_scope: "success",
  revision: "info",
  out_of_scope: "error",
  duplicate: "neutral",
  conflict: "warning",
  info: "neutral",
  unclear: "muted",
};

/** Mirrors what `proposeFromNote` can turn into a change; the server decides again. */
function actionable(i: ItemView): boolean {
  if (i.proposed || i.dismissed) return false;
  if (i.classification === "revision")
    return i.matchedType === "requirement" || i.matchedType === "task";
  return (
    i.classification === "new_in_scope" ||
    i.classification === "out_of_scope" ||
    i.classification === "info"
  );
}

/** What Saqina found in an analyzed note, and the way to turn findings into one proposal. */
export function NoteFindings({
  slug,
  noteId,
  items,
  canWrite,
}: {
  slug: string;
  noteId: string;
  items: ItemView[];
  canWrite: boolean;
}) {
  const t = useTranslations("meetings");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState(false);
  const { pending, error, run } = useRun();
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const ids = [...picked];
  const canPick = canWrite && items.some(actionable);

  return (
    <section className="mt-4 border-t border-border pt-4" aria-label={t("itemsTitle")}>
      <h3 className="text-sm font-medium">{t("itemsTitle")}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("noItems")}</p>
      ) : (
        <>
          {canPick ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("findingsHint")}</p>
          ) : null}
          <ul className="mt-2 space-y-3">
            {items.map((i) => (
              <li key={i.id} className="flex gap-3 rounded-md border border-border p-3 text-sm">
                {canPick ? (
                  <input
                    type="checkbox"
                    aria-label={t("select", { text: i.text })}
                    disabled={!actionable(i)}
                    checked={picked.has(i.id)}
                    onChange={() => toggle(i.id)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={CLASS_TONE[i.classification]}>
                      {t(`classes.${i.classification}`)}
                    </Chip>
                    <span className="text-xs text-subtle-foreground">
                      {t("confidence", { value: i.confidence })}
                    </span>
                    {i.proposed ? <Chip tone="info">{t("inProposal")}</Chip> : null}
                    {i.dismissed ? <Chip tone="muted">{t("dismissed")}</Chip> : null}
                  </div>
                  <p className="mt-2 break-words">{i.text}</p>
                  {i.quote ? (
                    <p className="mt-1 text-xs break-words text-muted-foreground">
                      {t("quote")}: “{i.quote}”
                    </p>
                  ) : null}
                  {i.rationale ? (
                    <p className="mt-1 text-xs break-words text-muted-foreground">{i.rationale}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <EngagementError error={error} />
      {created && !error ? (
        <Notice tone="success" className="mt-3">
          {t("proposalCreated")}
        </Notice>
      ) : null}
      {canPick ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || ids.length === 0}
            onClick={() => {
              setCreated(false);
              run(
                () => proposeNoteAction(slug, noteId, ids),
                () => {
                  setPicked(new Set());
                  setCreated(true);
                },
              );
            }}
          >
            {pending ? t("creatingProposal") : t("createProposal")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending || ids.length === 0}
            onClick={() =>
              run(
                () => dismissItemsAction(slug, noteId, ids),
                () => setPicked(new Set()),
              )
            }
          >
            {t("dismiss")}
          </Button>
        </div>
      ) : null}
      {created ? (
        <Link
          href={`/project/${slug}/approvals`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}
        >
          {t("viewApprovals")}
        </Link>
      ) : null}
    </section>
  );
}
