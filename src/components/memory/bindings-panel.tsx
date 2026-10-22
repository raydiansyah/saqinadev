"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createBindingAction,
  retryJobAction,
  revokeBindingAction,
} from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { Button } from "@/components/ui/button";
import { Notice, Select } from "@/components/ui/form";
import { MEMORY_KINDS, MEMORY_LEVELS } from "@/lib/domain/memory";

export function RetryJobButton({ slug, jobId }: { slug: string; jobId: string }) {
  const t = useTranslations("memoryHub.jobs");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(async () => void (await retryJobAction(slug, jobId)))}
    >
      {t("retry")}
    </Button>
  );
}

export function RevokeBindingButton({ slug, id }: { slug: string; id: string }) {
  const t = useTranslations("memoryHub.bindings");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending}
      onClick={() => startTransition(async () => void (await revokeBindingAction(slug, { id })))}
    >
      {t("revoke")}
    </Button>
  );
}

/** Equip an agent with all approved memory of one kind or one level. */
export function BindingForm({
  slug,
  agents,
}: {
  slug: string;
  agents: { id: string; name: string }[];
}) {
  const t = useTranslations("memoryHub");
  const errors = useTranslations("app.errors");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(form: FormData) {
    const kind = String(form.get("kind") ?? "");
    const level = String(form.get("level") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await createBindingAction(slug, {
        targetType: "agent",
        targetId: String(form.get("agent")),
        selector: { ...(kind ? { kind } : {}), ...(level ? { level } : {}) },
        priority: Number(form.get("priority") ?? 0),
      });
      if (!result.ok) setError(errors(result.code));
    });
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select id="binding-agent" name="agent" label={t("bindings.agent")} required>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select id="binding-kind" name="kind" label={t("bindings.kind")} defaultValue="">
          <option value="">{t("bindings.any")}</option>
          {MEMORY_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </Select>
        <Select id="binding-level" name="level" label={t("bindings.level")} defaultValue="">
          <option value="">{t("bindings.any")}</option>
          {MEMORY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(`level.${l}`)}
            </option>
          ))}
        </Select>
        <Select
          id="binding-priority"
          name="priority"
          label={t("bindings.priority")}
          defaultValue="0"
        >
          {[0, 10, 50, 100].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button type="submit" disabled={pending || agents.length === 0}>
        {t("bindings.add")}
      </Button>
    </form>
  );
}
