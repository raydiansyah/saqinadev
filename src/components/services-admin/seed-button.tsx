"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { seedServicesAction } from "@/app/[locale]/(app)/dashboard/services/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { ServiceError } from "./service-error";

/** Adds the starter services as private drafts (existing slugs are skipped). */
export function SeedButton() {
  const t = useTranslations("servicesAdmin.list");
  const { pending, error, run } = useRun();
  const [added, setAdded] = useState<number | null>(null);
  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          run<{ added: number }>(
            () => seedServicesAction(),
            (d) => setAdded(d.added),
          )
        }
      >
        {t("empty.seed")}
      </Button>
      {added !== null ? (
        <Notice tone="success">
          {added > 0 ? t("seeded", { count: added }) : t("seededNone")}
        </Notice>
      ) : null}
      <ServiceError error={error} />
    </div>
  );
}
