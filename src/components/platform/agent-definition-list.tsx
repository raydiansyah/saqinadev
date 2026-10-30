"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { setAgentDefinitionStatusAction } from "@/app/[locale]/(app)/dashboard/ai/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AgentDefinitionRow } from "@/lib/agent-definitions/service";
import { cn } from "@/lib/utils";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

const TONE = {
  active: "border-success/40 text-success",
  inactive: "border-border text-subtle-foreground",
  archived: "border-border text-subtle-foreground",
} as const;

/** Every kind of agent the platform has, with what it is for and whether it takes work. */
export function AgentDefinitionList({
  definitions,
  usage,
}: {
  definitions: AgentDefinitionRow[];
  usage: Record<
    string,
    { runs: number; succeeded: number; failed: number; lastRunAt: string | null }
  >;
}) {
  const t = useTranslations("platform.agents");
  const roles = useTranslations("assistant.agents.roles");
  const { pending, error, run } = useRun();
  const [archiving, setArchiving] = useState<AgentDefinitionRow | null>(null);
  const shown = definitions.filter((d) => d.status !== "archived");
  const archived = definitions.filter((d) => d.status === "archived");

  const setStatus = (d: AgentDefinitionRow, status: string, after?: () => void) =>
    run(() => setAgentDefinitionStatusAction({ id: d.id, status }), after);

  return (
    <section aria-labelledby="agents-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="agents-heading" className="font-semibold">
            {t("title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Link href="/dashboard/ai/agents?new=1" className={buttonVariants({ size: "sm" })}>
          {t("new")}
        </Link>
      </div>
      <FormError error={error} />
      <ul className="mt-4 space-y-3">
        {shown.map((d) => (
          <li key={d.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {roles(d.role as "planner")} · {d.key} · v{d.version}
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", TONE[d.status])}>
                    {t(`status.${d.status}`)}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                <p className="mt-2 text-xs text-subtle-foreground">
                  {t("summary", { tools: d.tools.length, permissions: d.permissions.length })}
                  {" · "}
                  {usage[d.id]
                    ? t("usage", {
                        runs: usage[d.id].runs,
                        succeeded: usage[d.id].succeeded,
                        failed: usage[d.id].failed,
                      })
                    : t("usageNone")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/ai/agents?edit=${d.id}`}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  {t("edit")}
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setStatus(d, d.status === "active" ? "inactive" : "active")}
                >
                  {d.status === "active" ? t("deactivate") : t("activate")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setArchiving(d)}
                >
                  {t("archive")}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {archived.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t("archivedCount", { count: archived.length })}
          </summary>
          <ul className="mt-3 space-y-2">
            {archived.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <span>
                  {d.name} <span className="text-muted-foreground">· {d.key}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setStatus(d, "inactive")}
                >
                  {t("restore")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <ConfirmDialog
        open={archiving !== null}
        title={t("archiveTitle", { name: archiving?.name ?? "" })}
        body={t("archiveBody")}
        confirmLabel={t("archive")}
        pending={pending}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && setStatus(archiving, "archived", () => setArchiving(null))}
      />
    </section>
  );
}
