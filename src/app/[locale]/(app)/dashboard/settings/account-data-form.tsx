"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { deleteAccountAction } from "./actions";

export interface DeletionBlockers {
  blockers: string[];
  sharedProjects: string[];
}

/** Export (a plain download link) and deletion (typed-email confirmation, blockers listed). */
export function AccountDataForm({ blockers, sharedProjects }: DeletionBlockers) {
  const t = useTranslations("app.settings.account");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const { pending, error, run } = useRun();

  function remove(event: React.FormEvent) {
    event.preventDefault();
    run(
      () => deleteAccountAction({ confirmEmail: email }),
      () => router.replace({ pathname: "/sign-in", query: { reason: "signed-out" } }),
    );
  }

  return (
    <div className="mt-4 space-y-6">
      <div>
        <h3 className="text-sm font-medium">{t("exportTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("exportBody")}</p>
        {/* Plain link: the response is a file download with Content-Disposition. */}
        <a
          href="/api/account/export"
          download
          className={buttonVariants({ variant: "outline", className: "mt-3" })}
        >
          {t("exportButton")}
        </a>
      </div>
      <form onSubmit={remove} className="space-y-3 border-t border-border pt-5">
        <h3 className="text-sm font-medium">{t("deleteTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
        {blockers.length > 0 ? (
          <div role="alert" className="rounded-md border border-border-strong p-3 text-sm">
            <p className="font-medium">{t("blockedTitle")}</p>
            <ul className="mt-1 list-disc pl-5">
              {blockers.map((b) => (
                <li key={b}>
                  {t(`blocked.${b}` as never, { projects: sharedProjects.join(", ") } as never)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Field
          id="delete-confirm-email"
          label={t("deleteConfirm")}
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={blockers.length > 0}
        />
        <FormError error={error} />
        <Button type="submit" variant="danger" disabled={pending || blockers.length > 0 || !email}>
          {pending ? t("deleting") : t("deleteButton")}
        </Button>
      </form>
    </div>
  );
}
