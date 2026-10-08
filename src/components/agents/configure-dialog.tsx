"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { configureAgentAction } from "@/app/[locale]/(app)/project/[slug]/agents/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import type { AgentType } from "@/lib/domain/enums";

/**
 * Preferences only (model and notes). The service rejects anything that looks like a
 * credential; that rejection is shown as a specific message, not a generic error.
 */
export function ConfigureDialog({
  slug,
  type,
  name,
  configuration,
  onClose,
}: {
  slug: string;
  type: AgentType;
  name: string;
  configuration: Record<string, string>;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(form: FormData) {
    const entries = {
      model: String(form.get("model") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(),
    };
    // Empty fields are left out so clearing a value removes it from the configuration.
    const next = Object.fromEntries(Object.entries(entries).filter(([, v]) => v.length > 0));
    startTransition(async () => {
      const result = await configureAgentAction(slug, { type, configuration: next });
      if (!result.ok) {
        setError(result.code === "VALIDATION_ERROR" ? t("secretRejected") : errors(result.code));
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("configureTitle", { name })}
      description={t("configureHint")}
    >
      <form action={onSubmit} className="space-y-4" aria-busy={pending}>
        <Field
          id={`${id}-model`}
          name="model"
          label={t("model")}
          defaultValue={configuration.model ?? ""}
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
        />
        <TextArea
          id={`${id}-notes`}
          name="notes"
          label={t("notes")}
          defaultValue={configuration.notes ?? ""}
          rows={4}
          maxLength={300}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {states("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? states("saving") : states("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
