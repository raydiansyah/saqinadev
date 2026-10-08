"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setDecisionStatusAction } from "@/app/[locale]/(app)/project/[slug]/decisions/actions";
import { Button } from "@/components/ui/button";
import type { DecisionStatus } from "@/lib/domain/enums";
import { DecisionDialog } from "./decision-dialog";

export function CreateDecisionButton({ slug }: { slug: string }) {
  const t = useTranslations("decisions");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("add")}</Button>
      {open ? <DecisionDialog slug={slug} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Superseded decisions can be accepted again; everything else can be superseded. */
export function DecisionStatusToggle({
  slug,
  id,
  number,
  status,
}: {
  slug: string;
  id: string;
  number: string;
  status: DecisionStatus;
}) {
  const t = useTranslations("decisions");
  const errors = useTranslations("app.errors");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next: DecisionStatus = status === "superseded" ? "accepted" : "superseded";
  const label = next === "accepted" ? t("accept") : t("supersede");

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`${label}: #${number}`}
        onClick={() =>
          startTransition(async () => {
            const result = await setDecisionStatusAction(slug, { id, status: next });
            setError(result.ok ? null : errors(result.code));
          })
        }
      >
        {label}
      </Button>
      <p aria-live="polite" className="text-xs text-error">
        {error}
      </p>
    </div>
  );
}
