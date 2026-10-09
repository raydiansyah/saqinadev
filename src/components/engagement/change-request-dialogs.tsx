"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  createChangeRequestAction,
  recordDecisionAction,
  updateChangeRequestAction,
} from "@/app/[locale]/(app)/project/[slug]/changes/actions";
import { Dialog } from "@/components/app/dialog";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";
import type { Currency } from "@/lib/domain/business";
import { fromMinor } from "@/lib/money";
import { EngagementError } from "./engagement-error";
import { parseAmount, parseCount } from "./format";

export interface CrDraft {
  id: string;
  number: string;
  title: string;
  description: string;
  impact: string;
  additionalCost: number;
  additionalDays: number;
}

function Actions({
  pending,
  onCancel,
  label,
}: {
  pending: boolean;
  onCancel: () => void;
  label: string;
}) {
  const common = useTranslations("engagement.common");
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onCancel}>
        {common("cancel")}
      </Button>
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </div>
  );
}

/** Create a CR (target "new") or edit a draft. Cost is entered in major units. */
export function ChangeRequestFormDialog({
  slug,
  currency,
  target,
  onClose,
}: {
  slug: string;
  currency: Currency;
  target: CrDraft | "new" | null;
  onClose: () => void;
}) {
  const t = useTranslations("engagement.changes");
  const common = useTranslations("engagement.common");
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const [invalid, setInvalid] = useState(false);
  const draft = target === "new" ? null : target;
  const close = () => {
    clear();
    setInvalid(false);
    onClose();
  };

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      title={draft ? t("editTitle", { number: draft.number }) : t("createTitle")}
      description={t("explain")}
    >
      {target ? (
        <form
          key={draft?.id ?? "new"}
          className="space-y-4"
          action={(form) => {
            const additionalCost = parseAmount(String(form.get("cost") ?? ""), currency);
            const additionalDays = parseCount(form.get("days"), 0);
            if (additionalCost === null || Number.isNaN(additionalDays)) {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            const input = {
              title: String(form.get("title") ?? ""),
              description: String(form.get("description") ?? ""),
              impact: String(form.get("impact") ?? ""),
              additionalCost,
              additionalDays,
            };
            run(
              () =>
                draft
                  ? updateChangeRequestAction(slug, draft.id, input)
                  : createChangeRequestAction(slug, input),
              close,
            );
          }}
        >
          <Field
            id={`${id}-title`}
            name="title"
            label={t("crTitle")}
            defaultValue={draft?.title}
            required
            minLength={3}
            maxLength={160}
          />
          <TextArea
            id={`${id}-description`}
            name="description"
            label={t("crDescription")}
            defaultValue={draft?.description}
            rows={3}
            maxLength={4000}
          />
          <TextArea
            id={`${id}-impact`}
            name="impact"
            label={t("impact")}
            placeholder={t("impactPlaceholder")}
            defaultValue={draft?.impact}
            rows={2}
            maxLength={2000}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${id}-cost`}
              name="cost"
              label={t("cost", { currency })}
              hint={t("costHint")}
              inputMode="decimal"
              defaultValue={draft ? String(fromMinor(draft.additionalCost, currency)) : "0"}
              className="font-mono"
            />
            <Field
              id={`${id}-days`}
              name="days"
              type="number"
              min={0}
              max={3650}
              label={t("days")}
              defaultValue={draft?.additionalDays ?? 0}
            />
          </div>
          {invalid ? (
            <Notice tone="error" className="mt-3">
              {t("invalidAmount")}
            </Notice>
          ) : null}
          <EngagementError error={error} />
          <Actions pending={pending} onCancel={close} label={common("save")} />
        </form>
      ) : null}
    </Dialog>
  );
}

/** Records a decision the client gave outside the portal. The note is the evidence. */
export function DecisionDialog({
  slug,
  target,
  onClose,
}: {
  slug: string;
  target: { id: string; number: string } | null;
  onClose: () => void;
}) {
  const t = useTranslations("engagement.changes");
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const close = () => {
    clear();
    onClose();
  };

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      title={target ? t("decisionTitle", { number: target.number }) : ""}
      description={t("decisionHint")}
    >
      {target ? (
        <form
          key={target.id}
          className="space-y-4"
          action={(form) =>
            run(
              () =>
                recordDecisionAction(slug, target.id, {
                  decision: String(form.get("decision") ?? ""),
                  note: String(form.get("note") ?? ""),
                }),
              close,
            )
          }
        >
          <Select
            id={`${id}-decision`}
            name="decision"
            label={t("decision")}
            defaultValue="approved"
          >
            <option value="approved">{t("approved")}</option>
            <option value="rejected">{t("rejected")}</option>
          </Select>
          <Field
            id={`${id}-note`}
            name="note"
            label={t("note")}
            placeholder={t("notePlaceholder")}
            required
            minLength={5}
            maxLength={2000}
          />
          <p className="text-xs text-subtle-foreground">{t("explain")}</p>
          <EngagementError error={error} />
          <Actions pending={pending} onCancel={close} label={t("recordDecision")} />
        </form>
      ) : null}
    </Dialog>
  );
}
