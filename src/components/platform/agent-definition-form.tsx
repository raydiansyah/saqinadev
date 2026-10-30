"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import {
  createAgentDefinitionAction,
  updateAgentDefinitionAction,
} from "@/app/[locale]/(app)/dashboard/ai/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { FIELD_CLASS, Field, TextArea } from "@/components/ui/form";
import { Link, useRouter } from "@/i18n/navigation";
import { ALLOWED_TOOL_NAMES, GRANTABLE_PERMISSIONS } from "@/lib/agent-definitions/input";
import type { AgentDefinitionRow } from "@/lib/agent-definitions/service";
import type { CatalogModel } from "@/lib/ai/model-resolver";
import { AGENT_DEFINITION_ROLES } from "@/lib/domain/executions";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

/** A skill the Owner installed under AI & Models > Skills. Names only: the text stays on the server. */
export interface InstalledSkill {
  slug: string;
  name: string;
  description: string;
  source: "builtin" | "paste" | "github";
  enabled: boolean;
}

interface Selected {
  definition: AgentDefinitionRow;
  versions: Array<{
    version: number;
    changedFields: string[];
    createdAt: Date;
    changedBy: string | null;
  }>;
}

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const num = (v: FormDataEntryValue | null) => Number(String(v ?? ""));

/** One agent's full definition. The server checks every field again; this only collects them. */
export function AgentDefinitionForm({
  selected,
  definitions,
  models,
  skills,
}: {
  selected: Selected | null;
  definitions: Array<{ key: string; name: string }>;
  models: CatalogModel[];
  skills: InstalledSkill[];
}) {
  const t = useTranslations("platform.agents");
  const roles = useTranslations("assistant.agents.roles");
  const id = useId();
  const router = useRouter();
  const { pending, error, run } = useRun();
  const d = selected?.definition;
  const options = models.filter((m) => m.status === "available" && m.providerEnabled);

  const checks = (name: string, all: readonly string[], on: readonly string[] = []) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {all.map((v) => (
        <label key={v} className="flex min-h-8 items-center gap-2 text-sm">
          <input type="checkbox" name={name} value={v} defaultChecked={on.includes(v)} />
          <span className="font-mono text-xs">{v}</span>
        </label>
      ))}
    </div>
  );

  return (
    <form
      className="max-w-3xl space-y-5"
      action={(form) => {
        const config = {
          name: String(form.get("name") ?? ""),
          role: String(form.get("role") ?? ""),
          description: String(form.get("description") ?? ""),
          instructions: String(form.get("instructions") ?? ""),
          responsibilities: lines(form.get("responsibilities")),
          allowedScope: lines(form.get("allowedScope")),
          forbidden: lines(form.get("forbidden")),
          inputRequirements: String(form.get("inputRequirements") ?? ""),
          expectedOutput: String(form.get("expectedOutput") ?? ""),
          definitionOfDone: lines(form.get("definitionOfDone")),
          modelId: String(form.get("modelId") ?? "") || null,
          tools: form.getAll("tools").map(String),
          permissions: form.getAll("permissions").map(String),
          skills: form.getAll("skills").map(String),
          handoffTargets: form.getAll("handoffTargets").map(String),
          maxAttempts: num(form.get("maxAttempts")),
          timeoutMs: num(form.get("timeoutSeconds")) * 1000,
          priority: num(form.get("priority")),
        };
        run(
          () =>
            d
              ? updateAgentDefinitionAction({ id: d.id, ...config })
              : createAgentDefinitionAction({ key: String(form.get("key") ?? ""), ...config }),
          () => router.push("/dashboard/ai/agents"),
        );
      }}
    >
      <h2 className="font-semibold">{d ? t("editTitle", { name: d.name }) : t("new")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {d ? null : (
          <Field id={`${id}-key`} name="key" label={t("key")} hint={t("keyHint")} required />
        )}
        <Field id={`${id}-name`} name="name" label={t("name")} defaultValue={d?.name} required />
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("role")}</span>
          <select
            name="role"
            defaultValue={d?.role ?? "custom"}
            className={`${FIELD_CLASS} min-h-11`}
          >
            {AGENT_DEFINITION_ROLES.map((r) => (
              <option key={r} value={r}>
                {roles(r as "planner")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Field
        id={`${id}-desc`}
        name="description"
        label={t("descriptionLabel")}
        defaultValue={d?.description}
      />
      <TextArea
        id={`${id}-instructions`}
        name="instructions"
        label={t("instructions")}
        hint={t("instructionsHint")}
        rows={8}
        defaultValue={d?.instructions}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextArea
          id={`${id}-resp`}
          name="responsibilities"
          label={t("responsibilities")}
          hint={t("perLine")}
          rows={4}
          defaultValue={d?.responsibilities.join("\n")}
        />
        <TextArea
          id={`${id}-scope`}
          name="allowedScope"
          label={t("allowedScope")}
          hint={t("perLine")}
          rows={4}
          defaultValue={d?.allowedScope.join("\n")}
        />
        <TextArea
          id={`${id}-forbidden`}
          name="forbidden"
          label={t("forbidden")}
          hint={t("perLine")}
          rows={4}
          defaultValue={d?.forbidden.join("\n")}
        />
        <TextArea
          id={`${id}-dod`}
          name="definitionOfDone"
          label={t("definitionOfDone")}
          hint={t("perLine")}
          rows={4}
          defaultValue={d?.definitionOfDone.join("\n")}
        />
        <TextArea
          id={`${id}-in`}
          name="inputRequirements"
          label={t("inputRequirements")}
          rows={3}
          defaultValue={d?.inputRequirements}
        />
        <TextArea
          id={`${id}-out`}
          name="expectedOutput"
          label={t("expectedOutput")}
          rows={3}
          defaultValue={d?.expectedOutput}
        />
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">{t("model")}</span>
        <select
          name="modelId"
          defaultValue={d?.modelId ?? ""}
          className={`${FIELD_CLASS} min-h-11`}
        >
          <option value="">{t("modelDefault")}</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.providerName} / {m.displayName}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("tools")}</legend>
        <p className="mb-2 text-xs text-subtle-foreground">{t("toolsHint")}</p>
        {checks("tools", ALLOWED_TOOL_NAMES, d?.tools)}
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("permissions")}</legend>
        <p className="mb-2 text-xs text-subtle-foreground">{t("permissionsHint")}</p>
        {checks("permissions", GRANTABLE_PERMISSIONS, d?.permissions)}
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("handoff")}</legend>
        {checks(
          "handoffTargets",
          definitions.filter((x) => x.key !== d?.key).map((x) => x.key),
          d?.handoffTargets,
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("skills")}</legend>
        <p className="mb-2 text-xs text-subtle-foreground">{t("skillsHint")}</p>
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("skillsNone")}</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {skills.map((s) => (
              <li key={s.slug}>
                <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    name="skills"
                    value={s.slug}
                    defaultChecked={d?.skills.includes(s.slug)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {s.name}
                      <span className="ml-2 font-mono text-[0.6875rem] font-normal text-subtle-foreground">
                        {s.source === "builtin" ? t("skillBuiltin") : t("skillCustom")}
                        {s.enabled ? "" : ` · ${t("skillOff")}`}
                      </span>
                    </span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {(d?.skills ?? [])
          .filter((slug) => !skills.some((s) => s.slug === slug))
          .map((slug) => (
            <label key={slug} className="mt-1 flex min-h-8 items-center gap-2 text-sm text-error">
              <input type="checkbox" name="skills" value={slug} defaultChecked />
              <span className="font-mono text-xs">{slug}</span> {t("skillMissing")}
            </label>
          ))}
        <Link
          href="/dashboard/ai/skills"
          className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline-offset-2 hover:underline"
        >
          {t("skillsManage")}
        </Link>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id={`${id}-attempts`}
          name="maxAttempts"
          type="number"
          min={1}
          max={5}
          label={t("maxAttempts")}
          defaultValue={d?.maxAttempts ?? 3}
        />
        <Field
          id={`${id}-timeout`}
          name="timeoutSeconds"
          type="number"
          min={10}
          max={900}
          label={t("timeout")}
          defaultValue={(d?.timeoutMs ?? 300_000) / 1000}
        />
        <Field
          id={`${id}-priority`}
          name="priority"
          type="number"
          min={-10}
          max={10}
          label={t("priority")}
          defaultValue={d?.priority ?? 0}
        />
      </div>
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <Link href="/dashboard/ai/agents" className={buttonVariants({ variant: "outline" })}>
          {t("cancel")}
        </Link>
      </div>
      {selected ? (
        <section aria-labelledby={`${id}-history`} className="border-t border-border pt-4">
          <h3 id={`${id}-history`} className="text-sm font-medium">
            {t("history")}
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {selected.versions.map((v) => (
              <li key={v.version}>
                v{v.version} · {v.changedFields.join(", ")} · {v.changedBy ?? t("system")} ·{" "}
                {new Date(v.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
