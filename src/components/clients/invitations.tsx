"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  createInvitationAction,
  revokeInvitationAction,
} from "@/app/[locale]/(app)/dashboard/clients/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { InviteLink } from "./invite-link";

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationView {
  id: string;
  email: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
}

const TONE: Record<InvitationStatus, string> = {
  pending: "border-info/40 text-info",
  accepted: "border-success/40 text-success",
  revoked: "border-border text-subtle-foreground",
  expired: "border-border text-subtle-foreground",
};

export function Invitations({
  clientId,
  invitations,
  canManage,
}: {
  clientId: string;
  invitations: InvitationView[];
  canManage: boolean;
}) {
  const t = useTranslations("clients.detail");
  const locale = useLocale();
  const [created, setCreated] = useState<{ url: string; emailed: boolean; email: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<InvitationView | null>(null);
  const { pending, error, run } = useRun();
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));

  return (
    <section aria-labelledby="invitations-heading" className="rounded-lg border border-border p-5">
      <h2 id="invitations-heading" className="font-medium">
        {t("invitations")}
      </h2>
      {canManage ? (
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const email = String(new FormData(form).get("email") ?? "").trim();
            setCreated(null);
            run<{ url: string; emailed: boolean }>(
              () => createInvitationAction(clientId, { email }, locale),
              (data) => {
                setCreated({ ...data, email });
                form.reset();
              },
            );
          }}
        >
          <div className="min-w-0 flex-1">
            <Field
              id="invite-email"
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="off"
              label={t("inviteEmail")}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? t("inviting") : t("invite")}
          </Button>
        </form>
      ) : null}
      <FormError error={error} />
      {created ? (
        <InviteLink
          url={created.url}
          email={created.email}
          emailed={created.emailed}
          onDone={() => setCreated(null)}
        />
      ) : null}
      {invitations.length === 0 ? (
        <p className="mt-4 text-sm text-subtle-foreground">{t("invitationsEmpty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {invitations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{i.email}</p>
                <p className="text-xs text-subtle-foreground">
                  {t("sent", { date: day(i.createdAt) })}
                  {i.status === "pending" ? ` · ${t("expires", { date: day(i.expiresAt) })}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-xs", TONE[i.status])}>
                  {t(`inviteStatuses.${i.status}`)}
                </span>
                {canManage && i.status === "pending" ? (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(i)}>
                    {t("revoke")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={t("revokeTitle")}
        body={t("revokeBody", { email: confirm?.email ?? "" })}
        confirmLabel={t("revoke")}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const id = confirm.id;
          setConfirm(null);
          run(() => revokeInvitationAction(clientId, id));
        }}
      />
    </section>
  );
}
