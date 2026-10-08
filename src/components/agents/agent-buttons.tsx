"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setPreferredAgentAction } from "@/app/[locale]/(app)/project/[slug]/agents/actions";
import { Button } from "@/components/ui/button";
import type { AgentType } from "@/lib/domain/enums";
import { ConfigureDialog } from "./configure-dialog";

/** Card actions: mark as preferred (records a choice, connects nothing) and configure. */
export function AgentActions({
  slug,
  type,
  name,
  preferred,
  configuration,
}: {
  slug: string;
  type: AgentType;
  name: string;
  preferred: boolean;
  configuration: Record<string, string>;
}) {
  const t = useTranslations("agents");
  const errors = useTranslations("app.errors");
  const [pending, startTransition] = useTransition();
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {preferred ? null : (
          <Button
            size="sm"
            disabled={pending}
            aria-label={`${t("setPreferred")}: ${name}`}
            onClick={() =>
              startTransition(async () => {
                const result = await setPreferredAgentAction(slug, { type });
                setError(result.ok ? null : errors(result.code));
              })
            }
          >
            {t("setPreferred")}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          aria-label={t("configureTitle", { name })}
          onClick={() => setConfiguring(true)}
        >
          {t("configure")}
        </Button>
      </div>
      <p aria-live="polite" className="mt-1 text-xs text-error empty:hidden">
        {error}
      </p>
      {configuring ? (
        <ConfigureDialog
          slug={slug}
          type={type}
          name={name}
          configuration={configuration}
          onClose={() => setConfiguring(false)}
        />
      ) : null}
    </div>
  );
}
