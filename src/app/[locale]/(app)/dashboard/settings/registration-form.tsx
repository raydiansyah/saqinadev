"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Switch } from "@/components/services-admin/switch";
import { Notice } from "@/components/ui/form";
import { setRegistrationAction } from "./actions";

/** Owner-only switch. The server enforces it at account creation; this is only the control. */
export function RegistrationForm({ enabled }: { enabled: boolean }) {
  const t = useTranslations("app.settings.registration");
  const [value, setValue] = useState(enabled);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useRun();

  function change(next: boolean) {
    setSaved(false);
    run(
      () => setRegistrationAction({ enabled: next }),
      () => {
        setValue(next);
        setSaved(true);
      },
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <Switch
          id="registration-switch"
          checked={value}
          onChange={change}
          label={t("toggle")}
          disabled={pending}
        />
        <span className="text-sm">{value ? t("enabled") : t("disabled")}</span>
      </div>
      <FormError error={error} />
      {saved && !error ? (
        <Notice tone="success" className="mt-3">
          {t("saved")}
        </Notice>
      ) : null}
    </div>
  );
}
