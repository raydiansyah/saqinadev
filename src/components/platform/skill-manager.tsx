"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  installSkillGithubAction,
  installSkillTextAction,
  removeSkillAction,
  updateSkillAction,
} from "@/app/[locale]/(app)/dashboard/ai/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Dialog } from "@/components/app/dialog";
import { EmptyState } from "@/components/app/states";
import { Switch } from "@/components/services-admin/switch";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/form";
import { SKILL_USES, type SkillUse } from "@/lib/domain/enums";
import type { PlatformSkillView } from "@/lib/skills/service";
import { cn } from "@/lib/utils";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

/**
 * Skills installed for every project. Built-in ones (Superpowers) can be switched off but not
 * removed; installed ones come from a pasted SKILL.md or a GitHub link.
 */
export function SkillManager({ skills }: { skills: PlatformSkillView[] }) {
  const t = useTranslations("platform.skills");
  const [installing, setInstalling] = useState(false);
  const [viewing, setViewing] = useState<PlatformSkillView | null>(null);
  const [removing, setRemoving] = useState<PlatformSkillView | null>(null);
  const { pending, error, run } = useRun();

  const toggleUse = (s: PlatformSkillView, use: SkillUse) => {
    const next = s.uses.includes(use) ? s.uses.filter((u) => u !== use) : [...s.uses, use];
    if (next.length === 0) return;
    run(() => updateSkillAction({ id: s.id, uses: next }));
  };

  return (
    <section aria-labelledby="skills-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="skills-heading" className="font-semibold">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <Button size="sm" onClick={() => setInstalling(true)}>
          {t("install")}
        </Button>
      </div>
      <FormError error={error} />
      {skills.length === 0 ? (
        <EmptyState className="mt-4" title={t("title")} body={t("empty")} />
      ) : (
        <ul className="mt-4 space-y-3">
          {skills.map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">{s.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.description}</p>
                  <p className="mt-1 font-mono text-xs break-all text-subtle-foreground">
                    {t(`sources.${s.source}`)}
                    {s.sourceUrl ? ` · ${s.sourceUrl}` : ""}
                  </p>
                </div>
                <Switch
                  checked={s.enabled}
                  label={t("enabled", { name: s.name })}
                  disabled={pending}
                  onChange={(enabled) => run(() => updateSkillAction({ id: s.id, enabled }))}
                />
              </div>
              <fieldset className="mt-3">
                <legend className="text-xs text-muted-foreground">{t("usesLabel")}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {SKILL_USES.map((use) => {
                    const on = s.uses.includes(use);
                    return (
                      <button
                        key={use}
                        type="button"
                        aria-pressed={on}
                        disabled={pending || (on && s.uses.length === 1)}
                        onClick={() => toggleUse(s, use)}
                        className={cn(
                          "min-h-11 rounded-md border px-3 text-xs disabled:opacity-60",
                          on
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(`uses.${use}`)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setViewing(s)}>
                  {t("view")}
                </Button>
                {s.source !== "builtin" ? (
                  <Button size="sm" variant="danger" onClick={() => setRemoving(s)}>
                    {t("remove")}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {installing ? <InstallDialog onClose={() => setInstalling(false)} /> : null}
      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name ?? ""}>
        {/* Shown as plain text: an installed skill is outside text, never rendered as HTML. */}
        <pre className="max-h-[60vh] overflow-auto rounded-md border border-border bg-surface-raised p-3 font-mono text-xs whitespace-pre-wrap">
          {viewing?.content}
        </pre>
      </Dialog>
      <ConfirmDialog
        open={Boolean(removing)}
        title={t("removeTitle", { name: removing?.name ?? "" })}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        pending={pending}
        onConfirm={() =>
          removing &&
          run(
            () => removeSkillAction({ id: removing.id }),
            () => setRemoving(null),
          )
        }
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}

function InstallDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("platform.skills");
  const states = useTranslations("app.states");
  const id = useId();
  const [mode, setMode] = useState<"github" | "paste">("github");
  const { pending, error, run } = useRun();
  const submit = (form: FormData) =>
    run(
      () =>
        mode === "github"
          ? installSkillGithubAction({ url: String(form.get("url") ?? "") })
          : installSkillTextAction({ content: String(form.get("content") ?? "") }),
      onClose,
    );
  return (
    <Dialog open onClose={onClose} title={t("install")}>
      <div role="tablist" aria-label={t("install")} className="mb-4 flex gap-1">
        {(["github", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "min-h-11 rounded-md px-3 text-sm",
              mode === m ? "bg-surface-raised font-medium" : "text-muted-foreground",
            )}
          >
            {t(`modes.${m}`)}
          </button>
        ))}
      </div>
      <form action={submit} className="space-y-4">
        {mode === "github" ? (
          <Field
            id={`${id}-url`}
            name="url"
            label={t("url")}
            placeholder="https://github.com/obra/superpowers/tree/main/skills/test-driven-development"
            hint={t("urlHint")}
            required
            maxLength={500}
          />
        ) : (
          <TextArea
            id={`${id}-content`}
            name="content"
            label={t("content")}
            hint={t("contentHint")}
            rows={12}
            required
            className="font-mono text-xs"
          />
        )}
        <FormError error={error} />
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {states("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("installing") : t("install")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
