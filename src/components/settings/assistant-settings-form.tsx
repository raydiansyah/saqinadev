"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { updateApprovalPolicyAction } from "@/app/[locale]/(app)/project/[slug]/settings/actions";
import { SaveIndicator, type SaveState } from "@/components/app/save-indicator";
import { Notice } from "@/components/ui/form";
import { APPROVAL_POLICIES, type ApprovalPolicy } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

/** Approval policy (saved on change) and which answer engine is active (read-only). */
export function AssistantSettingsForm({
  slug,
  policy,
  model,
  canEdit,
}: {
  slug: string;
  policy: ApprovalPolicy;
  /** Model name when an AI provider is configured on the server, otherwise null. */
  model: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("project.settings");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [value, setValue] = useState(policy);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, start] = useTransition();

  const change = (next: ApprovalPolicy) => {
    const previous = value;
    setValue(next);
    setState("saving");
    start(async () => {
      const result = await updateApprovalPolicyAction(slug, { approvalPolicy: next });
      if (!result.ok) {
        setValue(previous);
        setMessage(errors(result.code));
        setState("error");
        return;
      }
      setMessage(null);
      setState("saved");
    });
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-heading`} className="font-semibold">
            {t("assistant")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("assistantHint")}</p>
        </div>
        <SaveIndicator state={state} />
      </div>
      <fieldset className="mt-5 space-y-2" disabled={!canEdit}>
        <legend className="mb-2 text-sm font-medium">{t("approvalPolicy")}</legend>
        {APPROVAL_POLICIES.map((p) => (
          <label
            key={p}
            className={cn(
              "flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 text-sm",
              value === p ? "border-primary/60 bg-surface" : "border-border",
            )}
          >
            <input
              type="radio"
              name={`${id}-policy`}
              value={p}
              checked={value === p}
              onChange={() => change(p)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span className="text-pretty">{t(`policies.${p}`)}</span>
          </label>
        ))}
      </fieldset>
      {message ? (
        <Notice tone="error" className="mt-3">
          {message}
        </Notice>
      ) : null}
      <dl className="mt-5 border-t border-border pt-4 text-sm">
        <dt className="text-muted-foreground">{t("aiMode")}</dt>
        <dd className="mt-1 font-medium">{model ? t("aiModelActive", { model }) : t("aiRules")}</dd>
        <dd className="mt-1 text-xs text-subtle-foreground">{t("aiModeHint")}</dd>
      </dl>
    </section>
  );
}
