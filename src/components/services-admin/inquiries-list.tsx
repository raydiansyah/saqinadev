"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  makeClientAction,
  setInquiryStatusAction,
} from "@/app/[locale]/(app)/dashboard/services/inquiries/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { INQUIRY_STATUSES } from "@/lib/domain/services";
import { formatDateTime } from "@/lib/format";
import type { Inquiry } from "@/lib/services/inquiries";
import { cn } from "@/lib/utils";
import { ServiceError, useServiceErrorText } from "./service-error";

/** wa.me wants digits only with the country code; a leading 0 is read as Indonesian. */
function whatsappHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return `https://wa.me/${digits.startsWith("0") ? `62${digits.slice(1)}` : digits}`;
}

export function InquiriesList({ rows }: { rows: Inquiry[] }) {
  const t = useTranslations("servicesAdmin.inquiries");
  const tc = useTranslations("servicesAdmin");
  const locale = useLocale();
  const { pending, error, run, clear } = useRun();
  const [confirm, setConfirm] = useState<Inquiry | null>(null);
  const errorText = useServiceErrorText(error);

  return (
    <>
      <ServiceError error={confirm ? null : error} />
      <ul className="space-y-3">
        {rows.map((row) => {
          const wa = whatsappHref(row.whatsapp);
          return (
            <li key={row.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-medium">{row.name}</h3>
                  <p className="mt-0.5 text-xs text-subtle-foreground">
                    {t("received")}: {formatDateTime(new Date(row.createdAt), locale)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor={`inq-status-${row.id}`} className="sr-only">
                      {t("statusAria", { name: row.name })}
                    </label>
                    <select
                      id={`inq-status-${row.id}`}
                      value={row.status}
                      disabled={pending}
                      onChange={(e) => run(() => setInquiryStatusAction(row.id, e.target.value))}
                      className={cn(FIELD_CLASS, "min-h-11 py-2")}
                    >
                      {INQUIRY_STATUSES.map((s) => (
                        <option
                          key={s}
                          value={s}
                          // "Converted" is reachable only through Make client.
                          disabled={s === "converted" && !row.clientId}
                        >
                          {tc(`inquiryStatuses.${s}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {row.clientId ? (
                    <Link
                      href={`/dashboard/clients/${row.clientId}`}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      {t("openClient")}
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={pending}
                      aria-label={t("makeClientAria", { name: row.name })}
                      onClick={() => {
                        clear();
                        setConfirm(row);
                      }}
                    >
                      {t("makeClient")}
                    </Button>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Item label={t("company")}>{row.company || "-"}</Item>
                <Item label={t("email")}>
                  <a
                    href={`mailto:${row.email}`}
                    className="break-all underline underline-offset-2"
                  >
                    {row.email}
                  </a>
                </Item>
                <Item label={t("whatsapp")}>
                  {row.whatsapp ? (
                    wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        {row.whatsapp}
                      </a>
                    ) : (
                      row.whatsapp
                    )
                  ) : (
                    "-"
                  )}
                </Item>
                <Item label={t("service")}>
                  {row.serviceId ? (
                    <Link
                      href={`/dashboard/services/${row.serviceId}`}
                      className="underline underline-offset-2"
                    >
                      {row.serviceSlug}
                    </Link>
                  ) : (
                    (row.serviceSlug ?? t("noService"))
                  )}
                </Item>
              </dl>
              <p className="mt-3 text-xs text-subtle-foreground">{t("message")}</p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{row.message}</p>
            </li>
          );
        })}
      </ul>
      {confirm ? (
        <ConfirmDialog
          open
          title={t("confirmTitle")}
          body={
            <>
              <strong className="text-foreground">{confirm.name}</strong>
              <br />
              {t("confirmBody")}
            </>
          }
          confirmLabel={t("confirmLabel")}
          pending={pending}
          error={errorText}
          onConfirm={() =>
            run(
              () => makeClientAction(confirm.id),
              () => setConfirm(null),
            )
          }
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
