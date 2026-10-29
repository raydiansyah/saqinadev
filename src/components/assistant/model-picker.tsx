"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  addMyGatewayAction,
  myGatewaysAction,
  removeMyGatewayAction,
  testMyGatewayAction,
} from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select } from "@/components/ui/form";
import type { MyGateways } from "@/lib/ai/user-gateway";

type Loaded = MyGateways & { options: { id: string; label: string; vision: boolean }[] };
type Failure = { code: string; fields?: Record<string, string> };

const KEY = "saqina.chatModel";
const ADAPTERS = ["openai", "anthropic", "gemini", "openai_compatible"] as const;
/** Where each provider's own terms for API use live; shown next to the form. */
const TERMS: Record<string, string> = {
  openai: "https://openai.com/policies/terms-of-use/",
  anthropic: "https://www.anthropic.com/legal/commercial-terms",
  gemini: "https://ai.google.dev/gemini-api/terms",
};

const remembered = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const remember = (id: string | null) => {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // The choice then only lasts for this visit.
  }
};

/**
 * Chooses who answers: the platform's default model, or one of the person's own (their OpenAI,
 * Anthropic or Gemini key, or an OpenAI-compatible endpoint). Own keys are write-only and belong
 * to this person only. The choice is remembered in this browser.
 */
export function ModelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = useTranslations("assistant.modelPicker");
  const app = useTranslations("app.errors");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [adapter, setAdapter] = useState<(typeof ADAPTERS)[number]>("openai");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  // Load once, and restore the remembered choice if it is still offered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    void myGatewaysAction().then((r) => {
      if (!r.ok) return setFailed(true);
      setData(r.data);
      const saved = remembered();
      if (saved && r.data.options.some((o) => o.id === saved)) onChange(saved);
      else if (saved) remember(null);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const reload = async () => {
    const r = await myGatewaysAction();
    if (r.ok) setData(r.data);
    return r.ok ? r.data : null;
  };
  const text = (e: Failure) => {
    const field = e.fields ? Object.values(e.fields)[0] : undefined;
    const known = ["refused", "unreachable", "required", "externalOff", "invalid"];
    if (field && known.includes(field)) return t(`errors.${field}` as never);
    return app(e.code as never);
  };
  const choose = (next: string | null) => {
    onChange(next);
    remember(next);
  };
  const current = data?.options.find((o) => o.id === value) ?? null;
  const needsUrl = adapter === "openai_compatible";

  return (
    <div ref={panel}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 max-w-56 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground sm:min-h-9"
      >
        <span aria-hidden="true">◇</span>
        <span className="truncate">{current ? current.label : t("default")}</span>
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          className="absolute inset-x-3 bottom-full z-20 mb-2 max-h-[26rem] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          {failed ? (
            <p className="text-sm text-error">{t("failed")}</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("loading")}
            </p>
          ) : (
            <>
              <fieldset>
                <legend className="font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
                  {t("answersWith")}
                </legend>
                <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                  <input
                    type="radio"
                    name={`${id}-model`}
                    className="mt-1"
                    checked={value === null}
                    onChange={() => choose(null)}
                  />
                  <span>
                    <span className="block">{t("default")}</span>
                    <span className="block text-xs text-muted-foreground">{t("defaultHint")}</span>
                  </span>
                </label>
                {data.options.map((o) => (
                  <label
                    key={o.id}
                    className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm"
                  >
                    <input
                      type="radio"
                      name={`${id}-model`}
                      className="mt-1"
                      checked={value === o.id}
                      onChange={() => choose(o.id)}
                    />
                    <span className="min-w-0">
                      <span className="block break-words">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t("own")}
                        {o.vision ? ` · ${t("vision")}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {value ? (
                <p className="mt-2 text-xs text-muted-foreground">{t("ownNotice")}</p>
              ) : null}

              <div className="mt-3 border-t border-border pt-3">
                <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
                  {t("mine")}
                </p>
                {data.gateways.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("none")}</p>
                ) : (
                  <ul className="mt-1 divide-y divide-border">
                    {data.gateways.map((g) => (
                      <li key={g.id} className="py-2 text-sm">
                        <p className="font-medium">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`adapters.${g.adapter}` as never)} · {t(`status.${g.status}` as never)}{" "}
                          · {t("modelCount", { count: g.models.length })}
                        </p>
                        <div className="mt-1 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                const r = await testMyGatewayAction(g.id);
                                setError(
                                  r.ok ? (r.data.ok ? null : t("errors.testFailed")) : text(r),
                                );
                                await reload();
                              })
                            }
                          >
                            {t("test")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                const r = await removeMyGatewayAction(g.id);
                                if (!r.ok) return setError(text(r));
                                if (g.models.some((m) => m.id === value)) choose(null);
                                setError(null);
                                await reload();
                              })
                            }
                          >
                            {t("remove")}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!data.allowed ? (
                  <p className="mt-2 text-sm text-warning">{t("externalOff")}</p>
                ) : adding ? (
                  <form
                    className="mt-3 space-y-3"
                    action={(form) =>
                      start(async () => {
                        const models = String(form.get("models") ?? "")
                          .split(/[\s,]+/)
                          .filter(Boolean);
                        const r = await addMyGatewayAction({
                          name: String(form.get("name") ?? ""),
                          adapter,
                          baseUrl: needsUrl ? String(form.get("baseUrl") ?? "") || null : null,
                          secret: String(form.get("secret") ?? ""),
                          models,
                        });
                        if (!r.ok) return setError(text(r));
                        setError(null);
                        setAdding(false);
                        const fresh = await reload();
                        const first = fresh?.options.find((o) =>
                          fresh.gateways.some(
                            (g) => g.id === r.data.id && g.models.some((m) => m.id === o.id),
                          ),
                        );
                        if (first) choose(first.id);
                      })
                    }
                  >
                    <Select
                      id={`${id}-adapter`}
                      label={t("provider")}
                      value={adapter}
                      onChange={(e) => setAdapter(e.target.value as (typeof ADAPTERS)[number])}
                    >
                      {ADAPTERS.map((a) => (
                        <option key={a} value={a}>
                          {t(`adapters.${a}` as never)}
                        </option>
                      ))}
                    </Select>
                    <Field
                      id={`${id}-name`}
                      name="name"
                      label={t("name")}
                      maxLength={60}
                      required
                    />
                    {needsUrl ? (
                      <Field
                        id={`${id}-url`}
                        name="baseUrl"
                        label={t("baseUrl")}
                        hint={t("baseUrlHint")}
                        maxLength={300}
                      />
                    ) : null}
                    <Field
                      id={`${id}-key`}
                      name="secret"
                      type="password"
                      autoComplete="off"
                      label={t("apiKey")}
                      hint={t("apiKeyHint")}
                      maxLength={500}
                      required
                    />
                    <Field
                      id={`${id}-models`}
                      name="models"
                      label={t("models")}
                      hint={needsUrl ? t("modelsHintRequired") : t("modelsHint")}
                      maxLength={600}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("terms")}{" "}
                      {TERMS[adapter] ? (
                        <a
                          href={TERMS[adapter]}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {t("termsLink")}
                        </a>
                      ) : null}
                    </p>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={pending}>
                        {pending ? t("adding") : t("add")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAdding(false)}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setAdding(true)}
                  >
                    {t("addButton")}
                  </Button>
                )}
                {error ? (
                  <Notice tone="error" className="mt-2">
                    {error}
                  </Notice>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">{t("subscriptionNote")}</p>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
