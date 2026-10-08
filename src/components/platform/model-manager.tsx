"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  createModelAction,
  setDefaultsAction,
  updateModelAction,
} from "@/app/[locale]/(app)/dashboard/ai/actions";
import { Dialog } from "@/components/app/dialog";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import type { CatalogModel } from "@/lib/ai/model-resolver";
import { MODEL_CAPABILITIES, type ModelCapability } from "@/lib/domain/enums";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

const usable = (m: CatalogModel) =>
  m.status === "available" &&
  m.providerEnabled &&
  ["connected", "untested"].includes(m.providerStatus);

export function CapabilityChecks({ name, value }: { name: string; value: ModelCapability[] }) {
  const t = useTranslations("platform.models.capabilityNames");
  return (
    <div className="flex flex-wrap gap-2">
      {MODEL_CAPABILITIES.map((c) => (
        <label
          key={c}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 text-sm"
        >
          <input
            type="checkbox"
            name={name}
            value={c}
            defaultChecked={value.includes(c)}
            className="size-4 accent-[var(--primary)]"
          />
          {t(c)}
        </label>
      ))}
    </div>
  );
}

/** Model registry plus routing defaults. Only available models can become defaults. */
export function ModelManager({
  models,
  providers,
  defaultModelId,
  fallbackModelId,
}: {
  models: CatalogModel[];
  providers: { id: string; name: string }[];
  defaultModelId: string | null;
  fallbackModelId: string | null;
}) {
  const t = useTranslations("platform.models");
  const caps = useTranslations("platform.models.capabilityNames");
  const id = useId();
  const [editing, setEditing] = useState<CatalogModel | "new" | null>(null);
  const { pending, error, run } = useRun();
  const options = models.filter(usable);

  return (
    <div className="space-y-8">
      <section aria-labelledby={`${id}-models`}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${id}-models`} className="font-semibold">
            {t("title")}
          </h2>
          <Button size="sm" disabled={providers.length === 0} onClick={() => setEditing("new")}>
            {t("add")}
          </Button>
        </div>
        <FormError error={error} />
        {models.length === 0 ? (
          <EmptyState className="mt-4" title={t("title")} body={t("empty")} />
        ) : (
          <div className="relative mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-normal">{t("provider")}</th>
                  <th className="px-3 py-2 font-normal">{t("displayName")}</th>
                  <th className="px-3 py-2 font-normal">{t("capabilities")}</th>
                  <th className="px-3 py-2 font-normal">{t("status")}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t("save")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{m.providerName}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{m.displayName}</span>
                      <span className="block font-mono text-xs text-subtle-foreground">
                        {m.modelId}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {m.capabilities.map((c) => caps(c)).join(", ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t(`statuses.${m.status}`)}
                      {m.id === defaultModelId
                        ? ` · ${t("default")}`
                        : m.id === fallbackModelId
                          ? ` · ${t("fallback")}`
                          : ""}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                        {t("edit")}
                        <span className="sr-only">: {m.displayName}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            updateModelAction({
                              id: m.id,
                              displayName: m.displayName,
                              capabilities: m.capabilities,
                              status: m.status === "available" ? "disabled" : "available",
                            }),
                          )
                        }
                      >
                        {m.status === "available" ? t("disable") : t("enable")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-defaults`} className="rounded-lg border border-border p-5">
        <h2 id={`${id}-defaults`} className="font-semibold">
          {t("defaults")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("unavailable")}</p>
        <form
          // Remount after a save so the selects show the stored values.
          key={`${defaultModelId}-${fallbackModelId}`}
          className="mt-4 grid gap-4 sm:grid-cols-2"
          action={(form) =>
            run(() =>
              setDefaultsAction({
                defaultModelId: String(form.get("default") ?? "") || null,
                fallbackModelId: String(form.get("fallback") ?? "") || null,
              }),
            )
          }
        >
          {(["default", "fallback"] as const).map((k) => (
            <Select
              key={k}
              id={`${id}-${k}`}
              name={k}
              label={t(k)}
              defaultValue={(k === "default" ? defaultModelId : fallbackModelId) ?? ""}
            >
              <option value="">{t("noneOption")}</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.providerName} / {m.displayName}
                </option>
              ))}
            </Select>
          ))}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("saveDefaults")}
            </Button>
          </div>
        </form>
      </section>
      {editing ? (
        <ModelDialog
          model={editing === "new" ? null : editing}
          providers={providers}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ModelDialog({
  model,
  providers,
  onClose,
}: {
  model: CatalogModel | null;
  providers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("platform.models");
  const states = useTranslations("app.states");
  const id = useId();
  const { pending, error, run } = useRun();
  const submit = (form: FormData) => {
    const capabilities = form.getAll("capabilities").map(String);
    const contextWindow = Number(form.get("contextWindow")) || null;
    const displayName = String(form.get("displayName") ?? "");
    run(
      () =>
        model
          ? updateModelAction({
              id: model.id,
              displayName,
              capabilities,
              contextWindow,
              status: model.status,
            })
          : createModelAction({
              providerId: String(form.get("providerId")),
              modelId: String(form.get("modelId") ?? ""),
              displayName,
              capabilities,
              contextWindow,
            }),
      onClose,
    );
  };
  return (
    <Dialog open onClose={onClose} title={model ? model.displayName : t("add")}>
      <form action={submit} className="space-y-4">
        {model ? null : (
          <>
            <Select id={`${id}-provider`} name="providerId" label={t("provider")}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Field
              id={`${id}-model`}
              name="modelId"
              label={t("modelId")}
              required
              maxLength={120}
            />
          </>
        )}
        <Field
          id={`${id}-name`}
          name="displayName"
          label={t("displayName")}
          defaultValue={model?.displayName}
          required
          maxLength={80}
        />
        <fieldset>
          <legend className="text-sm font-medium">{t("capabilities")}</legend>
          <p className="mb-2 text-xs text-muted-foreground">{t("capabilitiesHint")}</p>
          <CapabilityChecks name="capabilities" value={model?.capabilities ?? ["text"]} />
        </fieldset>
        <Field
          id={`${id}-ctx`}
          name="contextWindow"
          type="number"
          min={1}
          label={t("contextWindow")}
        />
        <FormError error={error} />
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {states("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
