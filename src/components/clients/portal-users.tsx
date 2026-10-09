"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { removePortalUserAction } from "@/app/[locale]/(app)/dashboard/clients/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";

export interface PortalUserView {
  userId: string;
  name: string;
  email: string;
  since: string;
}

export function PortalUsers({
  clientId,
  users,
  canManage,
}: {
  clientId: string;
  users: PortalUserView[];
  canManage: boolean;
}) {
  const t = useTranslations("clients.detail");
  const locale = useLocale();
  const [confirm, setConfirm] = useState<PortalUserView | null>(null);
  const { pending, error, run } = useRun();
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));

  return (
    <section aria-labelledby="portal-users-heading" className="rounded-lg border border-border p-5">
      <h2 id="portal-users-heading" className="font-medium">
        {t("portalUsers")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("portalUsersHint")}</p>
      <FormError error={error} />
      {users.length === 0 ? (
        <p className="mt-4 text-sm text-subtle-foreground">{t("portalUsersEmpty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {users.map((u) => (
            <li key={u.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                <p className="text-xs text-subtle-foreground">
                  {t("since", { date: day(u.since) })}
                </p>
              </div>
              {canManage ? (
                <Button size="sm" variant="danger" onClick={() => setConfirm(u)}>
                  {t("remove")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={t("removeTitle")}
        body={t("removeBody", { name: confirm?.name ?? "" })}
        confirmLabel={t("remove")}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const userId = confirm.userId;
          setConfirm(null);
          run(() => removePortalUserAction(clientId, userId));
        }}
      />
    </section>
  );
}
