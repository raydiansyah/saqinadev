"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { setProjectClientAction } from "@/app/[locale]/(app)/project/[slug]/settings/actions";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { CURRENCIES, type Currency } from "@/lib/domain/business";
import { BillingError } from "./billing-error";

export interface ClientOption {
  id: string;
  name: string;
  company: string;
}

/** Client assignment, client portal switch and billing currency for one project. */
export function ProjectClientForm({
  slug,
  clients,
  values,
  currencyLocked,
}: {
  slug: string;
  clients: ClientOption[];
  values: { clientId: string | null; portalEnabled: boolean; currency: Currency };
  currencyLocked: boolean;
}) {
  const t = useTranslations("billing.client");
  const states = useTranslations("app.states");
  const id = useId();
  const [clientId, setClientId] = useState(values.clientId ?? "");
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useRun();

  return (
    <section aria-labelledby={`${id}-client`} className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={`${id}-client`} className="font-semibold">
          {t("title")}
        </h2>
        <Link
          href="/dashboard/clients"
          className={buttonVariants({ size: "sm", variant: "ghost" })}
        >
          {t("manage")}
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <form
        className="mt-5 space-y-4"
        onChange={() => setSaved(false)}
        action={(form) =>
          run(
            () =>
              setProjectClientAction(slug, {
                clientId: clientId || null,
                portalEnabled: form.get("portalEnabled") === "on",
                currency: String(form.get("currency") ?? values.currency),
              }),
            () => setSaved(true),
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id={`${id}-clientId`}
            name="clientId"
            label={t("client")}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">{t("none")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company ? `${c.name} (${c.company})` : c.name}
              </option>
            ))}
          </Select>
          <div>
            <Select
              id={`${id}-currency`}
              name="currency"
              label={t("currency")}
              defaultValue={values.currency}
              disabled={currencyLocked}
              aria-describedby={currencyLocked ? `${id}-currency-hint` : undefined}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {currencyLocked ? (
              <p id={`${id}-currency-hint`} className="mt-1.5 text-xs text-subtle-foreground">
                {t("currencyLocked")}
              </p>
            ) : null}
          </div>
        </div>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noClients")}</p>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="portalEnabled"
            defaultChecked={values.portalEnabled}
            disabled={!clientId}
            aria-describedby={`${id}-portal-hint`}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">{t("portal")}</span>
            <span id={`${id}-portal-hint`} className="block text-muted-foreground">
              {t("portalHint")}
            </span>
          </span>
        </label>
        <BillingError error={error} />
        <div className="flex items-center justify-end gap-3">
          <span aria-live="polite" className="text-xs text-success">
            {saved ? states("saved") : ""}
          </span>
          <Button type="submit" size="sm" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
