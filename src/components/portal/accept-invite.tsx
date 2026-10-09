"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { acceptInvitationAction } from "@/app/[locale]/invite/[token]/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";

type ErrorKey = "unavailable" | "wrongEmail" | "rateLimit" | "generic";

function errorKey(code: string, field?: string): ErrorKey {
  if (field === "invite.unavailable" || code === "CONFLICT" || code === "NOT_FOUND")
    return "unavailable";
  if (field === "invite.wrongEmail" || code === "AUTHORIZATION_ERROR") return "wrongEmail";
  if (code === "RATE_LIMIT") return "rateLimit";
  return "generic";
}

/** Accepts the invitation, then opens the portal. */
export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations("invite");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);

  const accept = () =>
    start(async () => {
      setError(null);
      const result = await acceptInvitationAction(token);
      if (!result.ok) {
        setError(errorKey(result.code, result.fields?.token));
        return;
      }
      router.replace("/portal");
    });

  return (
    <div>
      <Button className="w-full" onClick={accept} disabled={pending} aria-busy={pending}>
        {pending ? t("accepting") : t("accept")}
      </Button>
      {error ? (
        <Notice tone="error" className="mt-3">
          {t(`errors.${error}`)}
        </Notice>
      ) : null}
    </div>
  );
}
