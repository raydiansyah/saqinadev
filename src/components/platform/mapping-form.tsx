"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { setRoleMappingAction } from "@/app/[locale]/(app)/dashboard/ai/actions";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/ui/form";
import type { CatalogModel } from "@/lib/ai/model-resolver";
import type { ModelCapability } from "@/lib/domain/enums";
import { FormError } from "./form-error";
import { CapabilityChecks } from "./model-manager";
import { useRun } from "./use-run";

interface Row {
  role: string;
  primaryModelId: string | null;
  fallbackModelId: string | null;
  requiredCapabilities: ModelCapability[];
}

/** One form per agent role; the server rejects models lacking the required capabilities. */
export function MappingForm({ rows, models }: { rows: Row[]; models: CatalogModel[] }) {
  const t = useTranslations("platform.mapping");
  const roles = useTranslations("assistant.agents.roles");
  return (
    <section>
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li
            key={`${row.role}-${row.primaryModelId}-${row.fallbackModelId}-${row.requiredCapabilities.join(",")}`}
          >
            <RoleRow row={row} models={models} label={roles(row.role as "planner")} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoleRow({ row, models, label }: { row: Row; models: CatalogModel[]; label: string }) {
  const t = useTranslations("platform.mapping");
  const none = useTranslations("platform.models");
  const id = useId();
  const { pending, error, run } = useRun();
  const options = models.filter((m) => m.status === "available" && m.providerEnabled);
  const select = (name: "primary" | "fallback", value: string | null) => (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{t(name)}</span>
      <select id={`${id}-${name}`} name={name} defaultValue={value ?? ""} className={FIELD_CLASS}>
        <option value="">{name === "primary" ? t("clear") : none("noneOption")}</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.providerName} / {m.displayName}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      className="rounded-lg border border-border p-4"
      action={(form) =>
        run(() =>
          setRoleMappingAction({
            role: row.role,
            primaryModelId: String(form.get("primary") ?? "") || null,
            fallbackModelId: String(form.get("fallback") ?? "") || null,
            requiredCapabilities: form.getAll("required").map(String),
          }),
        )
      }
    >
      <p className="font-medium">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {select("primary", row.primaryModelId)}
        {select("fallback", row.fallbackModelId)}
      </div>
      <fieldset className="mt-3">
        <legend className="mb-1 text-sm text-muted-foreground">{t("required")}</legend>
        <CapabilityChecks name="required" value={row.requiredCapabilities} />
      </fieldset>
      <FormError error={error} />
      <Button className="mt-3" size="sm" type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
