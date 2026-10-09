"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { UI_MODES, type UiMode } from "@/lib/domain/business";
import { cn } from "@/lib/utils";
import { setUiModeAction } from "./actions";

/** Simple / Advanced navigation density. Presentation only; permissions are unaffected. */
export function WorkspaceModeForm({ mode }: { mode: UiMode }) {
  const t = useTranslations("workspaceMode");
  const [value, setValue] = useState<UiMode>(mode);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useRun();

  return (
    <form
      className="mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(
          () => setUiModeAction({ mode: value }),
          () => setSaved(true),
        );
      }}
    >
      <fieldset>
        <legend className="sr-only">{t("legend")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {UI_MODES.map((m) => (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-4 has-focus-visible:border-primary",
                value === m ? "border-primary/60 bg-surface-raised" : "border-border",
              )}
            >
              <input
                type="radio"
                name="mode"
                value={m}
                checked={value === m}
                onChange={() => {
                  setValue(m);
                  setSaved(false);
                }}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block font-medium">{t(m)}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{t(`${m}Body`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormError error={error} />
      {saved && !error ? (
        <Notice tone="success" className="mt-3">
          {t("saved")}
        </Notice>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button type="submit" variant="outline" disabled={pending || value === mode}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
