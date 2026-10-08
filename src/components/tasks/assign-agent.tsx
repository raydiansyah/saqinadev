"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import {
  assignAgentAction,
  suggestAgentsAction,
} from "@/app/[locale]/(app)/project/[slug]/tasks/actions";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import type { SelectionReason } from "@/lib/agents/selector";
import type { AgentCapability } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  name: string;
  executable: boolean;
  reasons: SelectionReason[];
}

/** Ranked agent suggestions with the selector's reasons; assigning starts the run. */
export function AssignAgent({ slug, taskId }: { slug: string; taskId: string }) {
  const t = useTranslations("tasks.agent");
  const caps = useTranslations("assistant.agents.capabilities");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [required, setRequired] = useState<AgentCapability[]>([]);
  const [agentId, setAgentId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    void suggestAgentsAction(slug, { taskId }).then((result) => {
      if (!live) return;
      if (!result.ok) return setError(errors(result.code));
      setSuggestions(result.data.suggestions);
      setRequired(result.data.required);
      setAgentId(result.data.suggestions[0]?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [slug, taskId, errors]);

  const list = (c: AgentCapability[]) => c.map((x) => caps(x)).join(", ");
  const reason = (r: SelectionReason) => {
    switch (r.code) {
      case "covers":
      case "missing":
        return t(`reasons.${r.code}`, { list: list(r.capabilities) });
      case "busy":
        return t("reasons.busy", { count: r.runs });
      default:
        return t(`reasons.${r.code}`);
    }
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await assignAgentAction(slug, { taskId, agentId, instructions });
      if (!result.ok) return setError(errors(result.code));
      setRunId(result.data.runId);
    });

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3 border-t border-border pt-4">
      <h3 id={`${id}-heading`} className="text-sm font-medium">
        {t("assign")}
      </h3>
      <p className="text-xs text-muted-foreground">{t("assignHint")}</p>
      {required.length ? (
        <p className="text-xs text-muted-foreground">{t("needs", { list: list(required) })}</p>
      ) : null}
      {suggestions === null && !error ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("loading")}
        </p>
      ) : null}
      {suggestions?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : null}
      {suggestions?.length ? (
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("assign")}</legend>
          {suggestions.map((s) => (
            <label
              key={s.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border px-3 py-2",
                agentId === s.id ? "border-primary/60 bg-surface-raised" : "border-border",
              )}
            >
              <input
                type="radio"
                name={`${id}-agent`}
                value={s.id}
                checked={agentId === s.id}
                onChange={() => setAgentId(s.id)}
                className="mt-1 size-4 accent-[var(--primary)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.reasons.map(reason).join(" · ")}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {suggestions?.length && !runId ? (
        <>
          <label htmlFor={`${id}-instructions`} className="block text-sm">
            {t("instructions")}
          </label>
          <textarea
            id={`${id}-instructions`}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={2000}
            rows={2}
            className={cn(FIELD_CLASS, "min-h-16 py-2")}
          />
          <Button size="sm" variant="outline" disabled={pending || !agentId} onClick={submit}>
            {t("submit")}
          </Button>
        </>
      ) : null}
      {runId ? (
        <Link
          href={`/project/${slug}/agents/runs/${runId}`}
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          {t("assigned")}
        </Link>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </section>
  );
}
