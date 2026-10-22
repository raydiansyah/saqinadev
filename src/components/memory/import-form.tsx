"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { importMemoryAction } from "@/app/[locale]/(app)/project/[slug]/memory/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { MAX_PACKAGE_BYTES } from "@/lib/memory/transfer/package";

type Done = {
  memories: number;
  skills: number;
  skipped: Record<"duplicate" | "blocked" | "previouslyRemoved" | "invalid" | "backlog", number>;
};

/** Reads a chosen file in the browser and hands its text to the server, which checks all of it. */
export function ImportForm({ slug }: { slug: string }) {
  const t = useTranslations("memoryHub.transfer");
  const errors = useTranslations("app.errors");
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function submit() {
    setError(null);
    setDone(null);
    if (!file) return setError(t("choose"));
    if (file.size > MAX_PACKAGE_BYTES) return setError(t("errors.too_large"));
    startTransition(async () => {
      const text = await file.text();
      const result = await importMemoryAction(slug, text);
      if (!result.ok) {
        const key = result.fields?.package;
        setError(key ? t(`errors.${key}` as "errors.invalid") : errors(result.code));
        return;
      }
      setDone(result.data as Done);
    });
  }

  return (
    <div className="space-y-4" aria-busy={pending}>
      <div>
        <label htmlFor="memory-package" className="mb-1.5 block text-sm font-medium">
          {t("file")}
        </label>
        <input
          id="memory-package"
          type="file"
          accept="application/json,.json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-4"
        />
      </div>
      <Button onClick={submit} disabled={pending}>
        {t("importButton")}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? (
        <Notice tone="success" className="space-y-2">
          <p>{t("done", { memories: done.memories, skills: done.skills })}</p>
          <p className="text-xs">
            {t("skipped", {
              duplicate: done.skipped.duplicate,
              blocked: done.skipped.blocked,
              removed: done.skipped.previouslyRemoved,
              invalid: done.skipped.invalid,
              backlog: done.skipped.backlog,
            })}
          </p>
          <Link href={`/project/${slug}/memory/review`} className="underline">
            {t("review")}
          </Link>
        </Notice>
      ) : null}
    </div>
  );
}
