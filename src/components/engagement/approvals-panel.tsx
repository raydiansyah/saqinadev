"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import {
  cancelApprovalAction,
  requestApprovalAction,
} from "@/app/[locale]/(app)/project/[slug]/client-approvals/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Notice, Select, TextArea } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { ApprovalStatus } from "@/lib/domain/business";
import { formatRelative } from "@/lib/format";
import { Chip } from "./chip";
import { EngagementError, useEngagementErrorText } from "./engagement-error";
import { RemindButton } from "./remind-button";

export interface ApprovalView {
  id: string;
  title: string;
  description: string;
  status: ApprovalStatus;
  responseNote: string | null;
  docSlug: string | null;
  docName: string | null;
  link: string | null;
  createdAt: string;
}

const TONE = {
  pending: "warning",
  approved: "success",
  changes_requested: "error",
  cancelled: "muted",
} as const;

/** Request form plus the list of approval requests with the client's answers. */
export function ApprovalsPanel({
  slug,
  approvals,
  documents,
  canWrite,
  portalReady,
}: {
  slug: string;
  approvals: ApprovalView[];
  documents: { slug: string; name: string }[];
  canWrite: boolean;
  portalReady: boolean;
}) {
  const t = useTranslations("engagement.approvals");
  const common = useTranslations("engagement.common");
  const locale = useLocale();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const create = useRun();
  const cancel = useRun();
  const cancelError = useEngagementErrorText(cancel.error);
  const [cancelling, setCancelling] = useState<ApprovalView | null>(null);
  const disabled = !canWrite || !portalReady;

  return (
    <div className="space-y-6">
      {canWrite ? (
        <section
          aria-labelledby={`${id}-form`}
          className="rounded-lg border border-border p-4 sm:p-5"
        >
          <h2 id={`${id}-form`} className="font-semibold">
            {t("formTitle")}
          </h2>
          {!portalReady ? (
            <Notice tone="info" className="mt-3">
              {common("portalOff")}{" "}
              <Link href={`/project/${slug}/settings`} className="underline underline-offset-4">
                {common("openSettings")}
              </Link>
            </Notice>
          ) : null}
          <form
            ref={form}
            className="mt-4 space-y-4"
            action={(data) =>
              create.run(
                () =>
                  requestApprovalAction(slug, {
                    title: String(data.get("title") ?? ""),
                    description: String(data.get("description") ?? ""),
                    docSlug: String(data.get("docSlug") ?? "") || undefined,
                    link: String(data.get("link") ?? ""),
                  }),
                () => form.current?.reset(),
              )
            }
          >
            <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
              <Field
                id={`${id}-title`}
                name="title"
                label={t("approvalTitle")}
                placeholder={t("approvalTitlePlaceholder")}
                required
                minLength={3}
                maxLength={160}
              />
              <TextArea
                id={`${id}-description`}
                name="description"
                label={t("approvalDescription")}
                rows={3}
                maxLength={2000}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Select id={`${id}-doc`} name="docSlug" label={t("document")} defaultValue="">
                    <option value="">{t("noDocument")}</option>
                    {documents.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1.5 text-xs text-subtle-foreground">{t("documentHint")}</p>
                </div>
                <Field
                  id={`${id}-link`}
                  name="link"
                  type="url"
                  label={t("link")}
                  hint={t("linkHint")}
                  placeholder="https://"
                  maxLength={500}
                />
              </div>
              <EngagementError error={create.error} />
              <div className="flex justify-end">
                <Button type="submit" disabled={disabled || create.pending}>
                  {t("submit")}
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      ) : null}

      {approvals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-6 py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {approvals.map((a) => (
            <li key={a.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={TONE[a.status]}>{t(`statuses.${a.status}`)}</Chip>
                <span className="text-xs text-subtle-foreground">
                  {t("requested", { date: formatRelative(new Date(a.createdAt), locale) })}
                </span>
              </div>
              <h3 className="mt-2 font-medium break-words">{a.title}</h3>
              {a.description ? (
                <p className="mt-1 text-sm whitespace-pre-line break-words text-muted-foreground">
                  {a.description}
                </p>
              ) : null}
              {a.responseNote ? (
                <blockquote className="mt-3 border-l-2 border-border-strong pl-3 text-sm">
                  <span className="block text-xs text-muted-foreground">{t("response")}</span>
                  <span className="whitespace-pre-line break-words">{a.responseNote}</span>
                </blockquote>
              ) : null}
              <div className="mt-3 flex flex-wrap items-start gap-2">
                {a.docSlug ? (
                  <Link
                    href={`/project/${slug}/documents/${a.docSlug}`}
                    className={buttonVariants({ size: "sm", variant: "ghost" })}
                  >
                    {t("openDocument")}
                    {a.docName ? ` (${a.docName})` : ""}
                  </Link>
                ) : null}
                {a.link ? (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ size: "sm", variant: "ghost" })}
                  >
                    {t("openLink")}
                  </a>
                ) : null}
                <span className="flex-1" />
                {canWrite && a.status === "pending" ? (
                  <>
                    <RemindButton slug={slug} entityType="client_approval" entityId={a.id} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        cancel.clear();
                        setCancelling(a);
                      }}
                    >
                      {t("cancelRequest")}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        title={t("cancelTitle")}
        body={cancelling ? `${cancelling.title}. ${t("cancelBody")}` : ""}
        confirmLabel={t("cancelRequest")}
        pending={cancel.pending}
        error={cancelError}
        onClose={() => setCancelling(null)}
        onConfirm={() => {
          if (cancelling)
            cancel.run(
              () => cancelApprovalAction(slug, cancelling.id),
              () => setCancelling(null),
            );
        }}
      />
    </div>
  );
}
