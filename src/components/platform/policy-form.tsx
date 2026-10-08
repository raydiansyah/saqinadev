"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { setPlatformRoleAction, setPolicyAction } from "@/app/[locale]/(app)/dashboard/ai/actions";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import type { Policy } from "@/lib/ai/model-resolver";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

/** Simple, deterministic policy plus the list of platform owners. */
export function PolicyForm({
  policy,
  providers,
  models,
  owners,
  bootstrap,
}: {
  policy: Policy;
  providers: { id: string; name: string }[];
  models: { id: string; label: string }[];
  owners: { id: string; name: string; email: string }[];
  bootstrap: boolean;
}) {
  const t = useTranslations("platform.policies");
  const id = useId();
  const { pending, error, run } = useRun();
  const owner = useRun();

  const checks = (
    name: string,
    items: { id: string; label: string }[],
    selected: string[] | null,
  ) => (
    <fieldset>
      <legend className="text-sm font-medium">
        {t(name === "providers" ? "allowedProviders" : "allowedModels")}
      </legend>
      <p className="mb-2 text-xs text-muted-foreground">{t("allAllowed")}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <label
            key={item.id}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={item.id}
              defaultChecked={selected?.includes(item.id) ?? false}
              className="size-4 accent-[var(--primary)]"
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-8">
      <form
        className="space-y-5 rounded-lg border border-border p-5"
        action={(form) => {
          const pick = (name: string) => {
            const values = form.getAll(name).map(String);
            return values.length ? values : null;
          };
          run(() =>
            setPolicyAction({
              allowedProviderIds: pick("providers"),
              allowedModelIds: pick("models"),
              allowProjectOverride: form.get("project") === "on",
              allowAgentOverride: form.get("agent") === "on",
              allowExternalProviders: form.get("external") === "on",
            }),
          );
        }}
      >
        <h2 className="font-semibold">{t("title")}</h2>
        {(
          [
            ["project", "allowProjectOverride", policy.allowProjectOverride],
            ["agent", "allowAgentOverride", policy.allowAgentOverride],
            ["external", "allowExternalProviders", policy.allowExternalProviders],
          ] as const
        ).map(([name, label, value]) => (
          <label key={name} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              defaultChecked={value}
              className="size-4 accent-[var(--primary)]"
            />
            {t(label)}
          </label>
        ))}
        {checks(
          "providers",
          providers.map((p) => ({ id: p.id, label: p.name })),
          policy.allowedProviderIds,
        )}
        {checks("models", models, policy.allowedModelIds)}
        <FormError error={error} />
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </form>

      <section aria-labelledby={`${id}-owners`} className="rounded-lg border border-border p-5">
        <h2 id={`${id}-owners`} className="font-semibold">
          {t("owners")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("ownersHint")}</p>
        {bootstrap ? (
          <Notice tone="info" className="mt-3">
            {t("envBootstrap")}
          </Notice>
        ) : null}
        <ul className="mt-4 space-y-2">
          {owners.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{o.name}</span>
                <span className="block truncate text-muted-foreground">{o.email}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={owner.pending}
                onClick={() =>
                  owner.run(() => setPlatformRoleAction({ email: o.email, role: "user" }))
                }
              >
                {t("demote")}
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          action={(form) =>
            owner.run(() =>
              setPlatformRoleAction({ email: String(form.get("email") ?? ""), role: "owner" }),
            )
          }
        >
          <div className="min-w-60 flex-1">
            <Field id={`${id}-email`} name="email" type="email" label={t("addOwner")} required />
          </div>
          <Button type="submit" disabled={owner.pending}>
            {t("promote")}
          </Button>
        </form>
        {owner.error?.field === "lastOwner" ? (
          <Notice tone="error" className="mt-3">
            {t("lastOwner")}
          </Notice>
        ) : (
          <FormError error={owner.error} />
        )}
      </section>
    </div>
  );
}
