"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  sendChangeRequestAction,
  setChangeRequestStatusAction,
} from "@/app/[locale]/(app)/project/[slug]/changes/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { ChangeRequestStatus, Currency, ScopeStatus } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { ChangeRequestFormDialog, type CrDraft, DecisionDialog } from "./change-request-dialogs";
import { Chip, SCOPE_TONE } from "./chip";
import { EngagementError, useEngagementErrorText } from "./engagement-error";
import { RemindButton } from "./remind-button";

export interface ChangeRequestView extends CrDraft {
  status: ChangeRequestStatus;
  scopeStatus: ScopeStatus;
  decisionNote: string | null;
}

const TONE = {
  draft: "neutral",
  sent: "warning",
  approved: "success",
  rejected: "error",
  cancelled: "muted",
  done: "info",
} as const;

type Confirm = { kind: "send" | "cancel"; cr: ChangeRequestView };

/** CR list with the draft, send, decide, cancel and done lifecycle. */
export function ChangesPanel({
  slug,
  currency,
  changes,
  canWrite,
  canDecide,
  portalReady,
}: {
  slug: string;
  currency: Currency;
  changes: ChangeRequestView[];
  canWrite: boolean;
  canDecide: boolean;
  portalReady: boolean;
}) {
  const t = useTranslations("engagement.changes");
  const common = useTranslations("engagement.common");
  const scope = useTranslations("engagement.scope");
  const locale = useLocale();
  const { pending, error, run, clear } = useRun();
  const errorText = useEngagementErrorText(error);
  const [editing, setEditing] = useState<CrDraft | "new" | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; number: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const ask = (c: Confirm) => {
    clear();
    setConfirm(c);
  };

  return (
    <div className="space-y-4">
      <Notice tone="info">{t("explain")}</Notice>
      {canWrite && !portalReady ? (
        <Notice tone="warning">
          {common("portalOff")}{" "}
          <Link href={`/project/${slug}/settings`} className="underline underline-offset-4">
            {common("openSettings")}
          </Link>
        </Notice>
      ) : null}
      {canWrite ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing("new")}>{t("create")}</Button>
        </div>
      ) : null}
      {confirm === null ? <EngagementError error={error} /> : null}

      {changes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-6 py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {changes.map((cr) => (
            <li key={cr.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium">{cr.number}</span>
                <Chip tone={TONE[cr.status]}>{t(`statuses.${cr.status}`)}</Chip>
                <Chip tone={SCOPE_TONE[cr.scopeStatus]}>{scope(cr.scopeStatus)}</Chip>
              </div>
              <h3 className="mt-2 font-medium break-words">{cr.title}</h3>
              {cr.description ? (
                <p className="mt-1 text-sm whitespace-pre-line break-words text-muted-foreground">
                  {cr.description}
                </p>
              ) : null}
              {cr.impact ? (
                <p className="mt-2 text-sm whitespace-pre-line break-words">
                  <span className="text-muted-foreground">{t("impact")}: </span>
                  {cr.impact}
                </p>
              ) : null}
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t("costLabel")}</dt>
                  <dd className="font-mono">{money(cr.additionalCost)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t("daysLabel")}</dt>
                  <dd>{t("daysValue", { days: cr.additionalDays })}</dd>
                </div>
              </dl>
              {cr.decisionNote ? (
                <p className="mt-2 text-sm break-words">
                  <span className="text-muted-foreground">{t("decisionNote")}: </span>
                  {cr.decisionNote}
                </p>
              ) : null}
              {canWrite ? (
                <div className="mt-3 flex flex-wrap items-start justify-end gap-2">
                  {cr.status === "draft" ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(cr)}>
                        {common("edit")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending || !portalReady}
                        onClick={() => ask({ kind: "send", cr })}
                      >
                        {t("send")}
                      </Button>
                    </>
                  ) : null}
                  {cr.status === "sent" ? (
                    <>
                      <RemindButton slug={slug} entityType="change_request" entityId={cr.id} />
                      {canDecide ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeciding({ id: cr.id, number: cr.number })}
                        >
                          {t("recordDecision")}
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {cr.status === "approved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => setChangeRequestStatusAction(slug, cr.id, "done"))}
                    >
                      {t("markDone")}
                    </Button>
                  ) : null}
                  {cr.status === "draft" || cr.status === "sent" ? (
                    <Button size="sm" variant="ghost" onClick={() => ask({ kind: "cancel", cr })}>
                      {t("cancelCr")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ChangeRequestFormDialog
        slug={slug}
        currency={currency}
        target={editing}
        onClose={() => setEditing(null)}
      />
      <DecisionDialog slug={slug} target={deciding} onClose={() => setDeciding(null)} />
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm
            ? t(confirm.kind === "send" ? "sendTitle" : "cancelTitle", {
                number: confirm.cr.number,
              })
            : ""
        }
        body={confirm ? t(confirm.kind === "send" ? "sendBody" : "cancelBody") : ""}
        confirmLabel={confirm?.kind === "send" ? t("send") : t("cancelCr")}
        pending={pending}
        error={errorText}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const { kind, cr } = confirm;
          run(
            () =>
              kind === "send"
                ? sendChangeRequestAction(slug, cr.id)
                : setChangeRequestStatusAction(slug, cr.id, "cancelled"),
            () => setConfirm(null),
          );
        }}
      />
    </div>
  );
}
