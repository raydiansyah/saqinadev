"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  createPlanAction,
  updatePlanAction,
} from "@/app/[locale]/(app)/project/[slug]/maintenance/actions";
import { Dialog } from "@/components/app/dialog";
import { localToday } from "@/components/billing/format";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";
import {
  type Currency,
  MAINTENANCE_CYCLES,
  MAINTENANCE_STATUSES,
  type MaintenanceCycle,
  type MaintenanceStatus,
} from "@/lib/domain/business";
import { fromMinor } from "@/lib/money";
import { EngagementError } from "./engagement-error";
import { parseAmount, parseCount } from "./format";

export interface PlanView {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  fee: number;
  cycle: MaintenanceCycle;
  scope: string;
  excluded: string;
  responseHours: number | null;
  status: MaintenanceStatus;
}

/** Create (target "new") or edit a maintenance plan. Fee is per cycle, in major units. */
export function PlanDialog({
  slug,
  currency,
  target,
  onClose,
}: {
  slug: string;
  currency: Currency;
  target: PlanView | "new" | null;
  onClose: () => void;
}) {
  const t = useTranslations("engagement.maintenance");
  const common = useTranslations("engagement.common");
  const id = useId();
  const { pending, error, run, clear } = useRun();
  const [invalid, setInvalid] = useState(false);
  const plan = target === "new" ? null : target;
  const close = () => {
    clear();
    setInvalid(false);
    onClose();
  };

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      title={plan ? t("editTitle") : t("createTitle")}
      description={t("description")}
    >
      {target ? (
        <form
          key={plan?.id ?? "new"}
          className="space-y-4"
          action={(form) => {
            const fee = parseAmount(String(form.get("fee") ?? ""), currency);
            const responseHours = parseCount(form.get("responseHours"), null);
            if (fee === null || Number.isNaN(responseHours)) {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            const input = {
              name: String(form.get("name") ?? ""),
              startDate: String(form.get("startDate") ?? ""),
              endDate: String(form.get("endDate") ?? ""),
              fee,
              cycle: String(form.get("cycle") ?? ""),
              scope: String(form.get("scope") ?? ""),
              excluded: String(form.get("excluded") ?? ""),
              responseHours,
            };
            run(
              () =>
                plan
                  ? updatePlanAction(slug, plan.id, {
                      ...input,
                      status: String(form.get("status") ?? ""),
                    })
                  : createPlanAction(slug, input),
              close,
            );
          }}
        >
          <Field
            id={`${id}-name`}
            name="name"
            label={t("name")}
            placeholder={t("namePlaceholder")}
            defaultValue={plan?.name}
            required
            minLength={2}
            maxLength={120}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${id}-start`}
              name="startDate"
              type="date"
              label={t("startDate")}
              defaultValue={plan?.startDate ?? localToday()}
              required
            />
            <Field
              id={`${id}-end`}
              name="endDate"
              type="date"
              label={t("endDate")}
              defaultValue={plan?.endDate}
              required
            />
            <Field
              id={`${id}-fee`}
              name="fee"
              label={t("fee", { currency })}
              inputMode="decimal"
              defaultValue={plan ? String(fromMinor(plan.fee, currency)) : ""}
              required
              className="font-mono"
            />
            <Select
              id={`${id}-cycle`}
              name="cycle"
              label={t("cycle")}
              defaultValue={plan?.cycle ?? "monthly"}
            >
              {MAINTENANCE_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {t(`cycleNames.${c}`)}
                </option>
              ))}
            </Select>
            <Field
              id={`${id}-response`}
              name="responseHours"
              type="number"
              min={1}
              max={720}
              label={t("responseHours")}
              defaultValue={plan?.responseHours ?? ""}
            />
            {plan ? (
              <Select
                id={`${id}-status`}
                name="status"
                label={t("status")}
                defaultValue={plan.status}
              >
                {MAINTENANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
          <TextArea
            id={`${id}-scope`}
            name="scope"
            label={t("planScope")}
            placeholder={t("planScopePlaceholder")}
            defaultValue={plan?.scope}
            rows={3}
            maxLength={4000}
          />
          <TextArea
            id={`${id}-excluded`}
            name="excluded"
            label={t("excluded")}
            placeholder={t("excludedPlaceholder")}
            defaultValue={plan?.excluded}
            rows={2}
            maxLength={4000}
          />
          {invalid ? (
            <Notice tone="error" className="mt-3">
              {t("invalidAmount")}
            </Notice>
          ) : null}
          <EngagementError error={error} />
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close}>
              {common("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {common("save")}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
