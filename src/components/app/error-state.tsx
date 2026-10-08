"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Used by error.tsx boundaries: actionable, with a reference but no internals. */
export function ErrorState({ reset, digest }: { reset: () => void; digest?: string }) {
  const t = useTranslations("app.states");
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("errorBody")}</p>
      <Button className="mt-6" onClick={reset}>
        {t("retry")}
      </Button>
      {digest ? (
        <p className="mt-6 font-mono text-xs text-subtle-foreground">
          {t("errorRef", { ref: digest.slice(0, 10) })}
        </p>
      ) : null}
    </div>
  );
}
