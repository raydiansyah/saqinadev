"use client";

import { useTranslations } from "next-intl";
import { FORBIDDEN_PERMISSIONS } from "@/lib/agents/capabilities";
import { AGENT_CAPABILITIES, AGENT_PERMISSIONS } from "@/lib/domain/enums";

/** Capabilities and permissions for a custom agent, kept visibly separate. */
export function CapabilityChecksAgent() {
  const t = useTranslations("integrations.agents");
  const names = useTranslations("assistant.agents");
  const group = (
    name: "capabilities" | "permissions",
    values: readonly string[],
    defaults: string[],
  ) => (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t(name)}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <label
            key={v}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={v}
              defaultChecked={defaults.includes(v)}
              className="size-4 accent-[var(--primary)]"
            />
            {names(`${name}.${v}` as never)}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <>
      {group("capabilities", AGENT_CAPABILITIES, ["frontend"])}
      {group(
        "permissions",
        AGENT_PERMISSIONS.filter((p) => !FORBIDDEN_PERMISSIONS.includes(p)),
        ["read_project", "read_prd", "read_tasks"],
      )}
    </>
  );
}
