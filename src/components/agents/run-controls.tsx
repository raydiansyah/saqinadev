"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  reassignRunAction,
  runControlAction,
} from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import { ErrorBlock } from "@/components/assistant/blocks/simple";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { availableControls } from "@/lib/agents/state";
import type { RunStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import type { AgentOption } from "../assistant/types";

/**
 * Retry, cancel, pause, resume and reassign. Only the controls the state machine allows are
 * shown; the server checks the transition again.
 */
export function RunControls({
  slug,
  runId,
  status,
  simulated,
  agents,
}: {
  slug: string;
  runId: string;
  status: RunStatus;
  simulated: boolean;
  agents: AgentOption[];
}) {
  const t = useTranslations("assistant.agents.run");
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; ref?: string } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [instructions, setInstructions] = useState("");
  const controls = availableControls(status);

  const run = (
    fn: () => Promise<{ ok: boolean; code?: string; ref?: string }>,
    after?: () => void,
  ) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) return setError({ code: result.code ?? "INTERNAL_ERROR", ref: result.ref });
      after?.();
      router.refresh();
    });

  const reassign = () =>
    start(async () => {
      setError(null);
      const result = await reassignRunAction(slug, {
        runId,
        agentId,
        instructions: instructions || undefined,
      });
      if (!result.ok) return setError({ code: result.code, ref: result.ref });
      router.push(`/project/${slug}/agents/runs/${result.data.runId}`);
    });

  if (!Object.values(controls).some(Boolean) && !cancelled) return null;

  return (
    <section
      aria-labelledby={`${id}-controls`}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2
        id={`${id}-controls`}
        className="font-mono text-xs uppercase tracking-wide text-subtle-foreground"
      >
        {t("controls")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {controls.retry ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => runControlAction(slug, "retry", { runId }))}
          >
            {t("retry")}
          </Button>
        ) : null}
        {controls.resume ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => runControlAction(slug, "resume", { runId }))}
          >
            {t("resume")}
          </Button>
        ) : null}
        {controls.pause ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => runControlAction(slug, "pause", { runId }))}
          >
            {t("pause")}
          </Button>
        ) : null}
        {controls.reassign && agents.length ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setReassigning((v) => !v)}
            aria-expanded={reassigning}
          >
            {t("reassign")}
          </Button>
        ) : null}
        {controls.cancel ? (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(
                () => runControlAction(slug, "cancel", { runId }),
                () => setCancelled(simulated),
              )
            }
          >
            {t("cancel")}
          </Button>
        ) : null}
      </div>

      {reassigning ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">{t("reassignTitle")}</p>
          <label htmlFor={`${id}-agent`} className="block text-sm">
            {t("agent")}
          </label>
          <select
            id={`${id}-agent`}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={cn(FIELD_CLASS, "w-full sm:w-auto")}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.executable ? "" : ` (${t("notConnected")})`}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-instructions`} className="block text-sm">
            {t("instructions")}
          </label>
          <textarea
            id={`${id}-instructions`}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={2000}
            rows={3}
            aria-describedby={`${id}-hint`}
            className={cn(FIELD_CLASS, "min-h-20 py-2")}
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {t("instructionsHint")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !agentId} onClick={reassign}>
              {t("submitReassign")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReassigning(false)}>
              {t("close")}
            </Button>
          </div>
        </div>
      ) : null}

      {cancelled ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("cancelledNote")}</p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <ErrorBlock code={error.code} reference={error.ref} />
        </div>
      ) : null}
    </section>
  );
}
