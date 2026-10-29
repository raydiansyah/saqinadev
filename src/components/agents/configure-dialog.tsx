"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  configureAgentAction,
  setAgentModelAction,
} from "@/app/[locale]/(app)/project/[slug]/agents/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Notice, Select, TextArea } from "@/components/ui/form";
import type { AgentModelChoice } from "@/lib/ai/project-settings";
import type { AgentType } from "@/lib/domain/enums";

/**
 * Model and notes. The model is picked from the models already set up (or Automatic), never
 * typed. Notes are refused when they look like a credential, with a specific message.
 */
export function ConfigureDialog({
  slug,
  type,
  name,
  configuration,
  models,
  onClose,
}: {
  slug: string;
  type: AgentType;
  name: string;
  configuration: Record<string, string>;
  models: AgentModelChoice;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = models.current[type] ?? null;
  // Saqina's own agents follow the platform policy; an outside agent only records a preference.
  const locked = type === "saqina" && !models.canPin;

  function onSubmit(form: FormData) {
    const notes = String(form.get("notes") ?? "").trim();
    const modelId = String(form.get("modelId") ?? "") || null;
    // Empty notes are left out so clearing them removes them from the configuration.
    const next: Record<string, string> = notes ? { notes } : {};
    startTransition(async () => {
      const result = await configureAgentAction(slug, { type, configuration: next });
      if (!result.ok) {
        setError(result.code === "VALIDATION_ERROR" ? t("secretRejected") : errors(result.code));
        return;
      }
      if (!locked) {
        const chosen = await setAgentModelAction(slug, { type, modelId });
        if (!chosen.ok) {
          setError(errors(chosen.code));
          return;
        }
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
        <div>
          <Select
            id={`${id}-model`}
            name="modelId"
            label={t("model")}
            defaultValue={current ?? ""}
            disabled={locked}
            aria-describedby={`${id}-model-hint`}
          >
            <option value="">
              {models.automatic
                ? t("modelAutomatic", { model: models.automatic })
                : t("modelAutomaticNone")}
            </option>
            {models.options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
          <p id={`${id}-model-hint`} className="mt-1.5 text-xs text-subtle-foreground">
            {locked
              ? t("modelLocked")
              : models.options.length === 0
                ? t("modelNone")
                : type === "saqina"
                  ? t("modelHint")
                  : t("modelHintExternal")}
          </p>
        </div>
        <TextArea
          id={`${id}-notes`}
          name="notes"
          label={t("notes")}
          placeholder={t("placeholders.notes")}
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
