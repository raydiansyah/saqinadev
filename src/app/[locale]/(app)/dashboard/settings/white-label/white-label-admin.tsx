"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select } from "@/components/ui/form";
import { onSubmitData } from "@/components/ui/form-submit";
import { WHITE_LABEL_BASES } from "@/lib/white-label/policy";
import { grantWhiteLabelAction, revokeWhiteLabelAction } from "../actions";

/** Platform owner only: open white label after a paid plan or a signed agreement, or close it. */
export function WhiteLabelAdmin({ orgs }: { orgs: { id: string; name: string; open: boolean }[] }) {
  const t = useTranslations("app.whiteLabel.admin");
  const bases = useTranslations("app.whiteLabel.bases");
  const id = useId();
  const { pending, error, run } = useRun();
  const [done, setDone] = useState(false);

  return (
    <section aria-labelledby={`${id}-h`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-h`} className="font-medium">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("body")}</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={onSubmitData((form) => {
          setDone(false);
          run(
            () =>
              grantWhiteLabelAction({
                organizationId: form.get("organizationId"),
                basis: form.get("basis"),
                reference: form.get("reference"),
                note: form.get("note") ?? "",
                validUntil: form.get("validUntil") ?? "",
              }),
            () => setDone(true),
          );
        })}
      >
        <Select id={`${id}-org`} name="organizationId" label={t("organization")} required>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.open ? ` (${t("open")})` : ""}
            </option>
          ))}
        </Select>
        <Select id={`${id}-basis`} name="basis" label={t("basis")} defaultValue="paid_plan">
          {WHITE_LABEL_BASES.map((b) => (
            <option key={b} value={b}>
              {bases(b)}
            </option>
          ))}
        </Select>
        <Field
          id={`${id}-ref`}
          name="reference"
          label={t("reference")}
          hint={t("referenceHint")}
          minLength={3}
          maxLength={120}
          required
        />
        <Field
          id={`${id}-until`}
          name="validUntil"
          type="date"
          label={t("validUntil")}
          hint={t("validUntilHint")}
        />
        <Field id={`${id}-note`} name="note" label={t("note")} maxLength={500} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {t("grant")}
          </Button>
        </div>
      </form>
      {done ? (
        <Notice tone="success" className="mt-3">
          {t("granted")}
        </Notice>
      ) : null}
      <FormError error={error} />

      <h3 className="mt-6 text-sm font-medium">{t("closeTitle")}</h3>
      <ul className="mt-2 divide-y divide-border">
        {orgs
          .filter((o) => o.open)
          .map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{o.name}</span>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => run(() => revokeWhiteLabelAction({ organizationId: o.id }))}
              >
                {t("revoke")}
              </Button>
            </li>
          ))}
      </ul>
    </section>
  );
}
