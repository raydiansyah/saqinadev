"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  archiveServiceAction,
  duplicateServiceAction,
  moveServiceAction,
  setServiceFlagAction,
} from "@/app/[locale]/(app)/dashboard/services/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Chip } from "@/components/engagement/chip";
import { useRun } from "@/components/platform/use-run";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { PRICED_TYPES } from "@/lib/domain/services";
import { formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { ServiceRow } from "@/lib/services/admin";
import { cn } from "@/lib/utils";
import { ServiceError, useServiceErrorText } from "./service-error";
import { Switch } from "./switch";

type Flag = "isPublished" | "isPublic" | "isComingSoon" | "isFeatured" | "showPrice";
const FLAGS: Flag[] = ["isPublished", "isPublic", "isComingSoon", "isFeatured", "showPrice"];

type Pending =
  | { kind: "flag"; row: ServiceRow; flag: "isPublished" | "showPrice" }
  | { kind: "archive"; row: ServiceRow; archived: boolean }
  | null;

const isLive = (r: ServiceRow) => r.isPublished && r.isPublic && !r.archivedAt;

/** The owner list: quick switches, reordering, archive and duplicate, all through server actions. */
export function ServiceTable({
  rows,
  canReorder,
  offset,
  total,
}: {
  rows: ServiceRow[];
  canReorder: boolean;
  offset: number;
  total: number;
}) {
  const t = useTranslations("servicesAdmin.list");
  const tc = useTranslations("servicesAdmin");
  const locale = useLocale();
  const { pending, error, run, clear } = useRun();
  const [confirm, setConfirm] = useState<Pending>(null);
  const errorText = useServiceErrorText(error);

  const flip = (row: ServiceRow, flag: Flag) => {
    const next = !row[flag];
    // Publishing and revealing the price are the two switches that change what visitors see.
    if (next && (flag === "isPublished" || flag === "showPrice")) {
      clear();
      setConfirm({ kind: "flag", row, flag });
      return;
    }
    run(() => setServiceFlagAction(row.id, flag, next));
  };

  const confirmCopy = confirm
    ? confirm.kind === "archive"
      ? confirm.archived
        ? {
            title: t("confirm.archiveTitle"),
            body: t("confirm.archiveBody"),
            label: t("confirm.archive"),
          }
        : {
            title: t("confirm.restoreTitle"),
            body: t("confirm.restoreBody"),
            label: t("confirm.restore"),
          }
      : confirm.flag === "isPublished"
        ? {
            title: t("confirm.publishTitle"),
            body: t("confirm.publishBody"),
            label: t("confirm.publish"),
          }
        : {
            title: t("confirm.priceTitle"),
            body: t("confirm.priceBody"),
            label: t("confirm.price"),
          }
    : null;

  const onConfirm = () => {
    if (!confirm) return;
    const action =
      confirm.kind === "archive"
        ? () => archiveServiceAction(confirm.row.id, confirm.archived)
        : () => setServiceFlagAction(confirm.row.id, confirm.flag, true);
    run(action, () => setConfirm(null));
  };

  return (
    <>
      <ServiceError error={confirm ? null : error} />
      <div className="relative mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[68rem] text-left text-sm">
          <thead className="border-b border-border bg-surface text-xs text-muted-foreground">
            <tr>
              {(
                [
                  "name",
                  "category",
                  "status",
                  "toggles",
                  "price",
                  "order",
                  "updated",
                  "actions",
                ] as const
              ).map((c) => (
                <th key={c} scope="col" className="px-3 py-2.5 font-medium whitespace-nowrap">
                  {t(`columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => {
              const priced = PRICED_TYPES.includes(row.pricingType);
              return (
                <tr key={row.id} className="align-top">
                  <th scope="row" className="max-w-56 px-3 py-3 font-medium">
                    <Link
                      href={`/dashboard/services/${row.id}`}
                      className="block truncate hover:underline"
                    >
                      {row.internalName}
                    </Link>
                    <span className="mt-0.5 block truncate font-mono text-xs font-normal text-subtle-foreground">
                      /{row.slug}
                    </span>
                  </th>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {tc(`categories.${row.category}`)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.archivedAt ? <Chip tone="muted">{t("chips.archived")}</Chip> : null}
                      <Chip tone={row.isPublished ? "success" : "neutral"}>
                        {row.isPublished ? t("chips.published") : t("chips.draft")}
                      </Chip>
                      {!row.isPublic ? <Chip tone="warning">{t("chips.hidden")}</Chip> : null}
                      {row.isComingSoon ? <Chip tone="info">{t("chips.comingSoon")}</Chip> : null}
                      {row.isFeatured ? <Chip tone="info">{t("chips.featured")}</Chip> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <ul className="grid gap-1.5">
                      {FLAGS.map((flag) => (
                        <li key={flag} className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground">
                            {t(`toggles.${flag}`)}
                          </span>
                          <Switch
                            checked={row[flag]}
                            disabled={pending}
                            label={t("toggleAria", {
                              label: t(`toggles.${flag}`),
                              name: row.internalName,
                            })}
                            onChange={() => flip(row, flag)}
                          />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-3">
                    <p className="whitespace-nowrap">
                      {priced && row.priceAmount !== null
                        ? formatMoney(row.priceAmount, row.currency, locale)
                        : tc(`pricingTypes.${row.pricingType}`)}
                    </p>
                    {priced ? (
                      <p className="text-xs text-subtle-foreground">
                        {tc(`pricingTypes.${row.pricingType}`)}
                      </p>
                    ) : null}
                    {!row.showPrice ? (
                      <p className="mt-1 text-xs text-warning">{t("priceHidden")}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap tabular-nums">
                    {row.displayOrder}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {formatRelative(new Date(row.updatedAt), locale)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/dashboard/services/${row.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                        aria-label={t("actionAria", {
                          action: t("actions.edit"),
                          name: row.internalName,
                        })}
                      >
                        {t("actions.edit")}
                      </Link>
                      {isLive(row) ? (
                        <Link
                          href={`/services/${row.slug}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                          aria-label={t("actionAria", {
                            action: t("actions.viewPublic"),
                            name: row.internalName,
                          })}
                        >
                          {t("actions.viewPublic")}
                        </Link>
                      ) : null}
                      {canReorder && !row.archivedAt ? (
                        <>
                          <RowButton
                            label={t("actions.moveUp")}
                            name={row.internalName}
                            disabled={pending || offset + index === 0}
                            onClick={() => run(() => moveServiceAction(row.id, "up"))}
                            glyph="↑"
                          />
                          <RowButton
                            label={t("actions.moveDown")}
                            name={row.internalName}
                            disabled={pending || offset + index >= total - 1}
                            onClick={() => run(() => moveServiceAction(row.id, "down"))}
                            glyph="↓"
                          />
                        </>
                      ) : null}
                      <RowButton
                        label={t("actions.duplicate")}
                        name={row.internalName}
                        disabled={pending}
                        onClick={() => run(() => duplicateServiceAction(row.id))}
                      />
                      <RowButton
                        label={row.archivedAt ? t("actions.restore") : t("actions.archive")}
                        name={row.internalName}
                        disabled={pending}
                        onClick={() => {
                          clear();
                          setConfirm({ kind: "archive", row, archived: !row.archivedAt });
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {confirm && confirmCopy ? (
        <ConfirmDialog
          open
          title={confirmCopy.title}
          body={
            <>
              <strong className="text-foreground">{confirm.row.internalName}</strong>
              <br />
              {confirmCopy.body}
            </>
          }
          confirmLabel={confirmCopy.label}
          pending={pending}
          error={errorText}
          onConfirm={onConfirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}

function RowButton({
  label,
  name,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  name: string;
  glyph?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("servicesAdmin.list");
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={t("actionAria", { action: label, name })}
      title={label}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
    >
      <span aria-hidden="true">{glyph ?? label}</span>
    </button>
  );
}
