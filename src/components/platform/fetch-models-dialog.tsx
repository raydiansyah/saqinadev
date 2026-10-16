"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import {
  fetchProviderModelsAction,
  importModelsAction,
} from "@/app/[locale]/(app)/dashboard/ai/actions";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Notice, Select } from "@/components/ui/form";
import type { FetchedModel } from "@/lib/ai/control-plane";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

const ERROR_CODES = ["auth_failed", "network", "rate_limited", "no_credential", "bad_response"];

/**
 * Asks a provider which models its key can use, lists the chat models with their likely
 * abilities, and adds the ones the owner ticks. Abilities are a guess from the model id and can
 * be corrected afterwards with Edit.
 */
export function FetchModelsDialog({
  providers,
  onClose,
}: {
  providers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("platform.models.fetch");
  const caps = useTranslations("platform.models.capabilityNames");
  const states = useTranslations("app.states");
  const id = useId();
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [models, setModels] = useState<FetchedModel[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const load = useRun();
  const save = useRun();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models ?? []).filter((m) => !q || m.modelId.toLowerCase().includes(q));
  }, [models, query]);
  const selectable = shown.filter((m) => !m.added);

  function fetchList() {
    setModels(null);
    setFailure(null);
    setResult(null);
    setPicked(new Set());
    load.run<{ ok: boolean; code: string; models: FetchedModel[] }>(
      () => fetchProviderModelsAction({ providerId }),
      (r) => {
        if (r.ok) setModels(r.models);
        else setFailure(r.code);
      },
    );
  }

  const toggle = (modelId: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(modelId)) next.add(modelId);
      return next;
    });

  return (
    <Dialog open onClose={onClose} title={t("title")} description={t("hint")} className="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Select
              id={`${id}-provider`}
              label={t("provider")}
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setModels(null);
                setFailure(null);
                setResult(null);
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" disabled={load.pending || !providerId} onClick={fetchList}>
            {load.pending ? t("fetching") : models ? t("refetch") : t("fetch")}
          </Button>
        </div>
        <FormError error={load.error} />
        {failure ? (
          <Notice tone="error">
            {t(`errors.${ERROR_CODES.includes(failure) ? failure : "unknown"}` as "errors.unknown")}
          </Notice>
        ) : null}

        {models && models.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : null}
        {models && models.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                aria-label={t("search")}
                placeholder={t("search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-h-11 flex-1 rounded-md border border-border-strong bg-surface px-3.5 text-[0.9375rem] focus-visible:border-primary"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPicked(new Set(selectable.map((m) => m.modelId)))}
              >
                {t("selectAll")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                {t("clear")}
              </Button>
            </div>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {shown.map((m) => (
                <li key={m.modelId}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-surface-raised">
                    <input
                      type="checkbox"
                      disabled={m.added}
                      checked={m.added || picked.has(m.modelId)}
                      onChange={() => toggle(m.modelId)}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block font-mono break-all">{m.modelId}</span>
                      <span className="block text-xs text-muted-foreground">
                        {m.added
                          ? t("alreadyAdded")
                          : m.capabilities.map((c) => caps(c)).join(", ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <FormError error={save.error} />
        {result ? (
          <Notice tone="success">
            {t("added", { count: result.added, skipped: result.skipped })}
          </Notice>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {result ? t("done") : states("cancel")}
          </Button>
          <Button
            disabled={save.pending || picked.size === 0}
            onClick={() =>
              save.run<{ added: number; skipped: number }>(
                () =>
                  importModelsAction({
                    providerId,
                    models: (models ?? [])
                      .filter((m) => picked.has(m.modelId))
                      .map(({ modelId, displayName, capabilities }) => ({
                        modelId,
                        displayName,
                        capabilities,
                      })),
                  }),
                (r) => {
                  setResult(r);
                  setModels((list) =>
                    (list ?? []).map((m) => (picked.has(m.modelId) ? { ...m, added: true } : m)),
                  );
                  setPicked(new Set());
                },
              )
            }
          >
            {save.pending ? t("adding") : t("addSelected", { count: picked.size })}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
