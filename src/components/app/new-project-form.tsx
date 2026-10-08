"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useEffect, useId, useState, useTransition } from "react";
import { startProjectAction } from "@/app/[locale]/(app)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Notice, TextArea } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { clearState, loadState } from "@/lib/interview/storage";
import type { Answers } from "@/lib/interview/types";

/** Starts a project from a sentence; optionally carries over the anonymous /start answers. */
export function NewProjectForm() {
  const t = useTranslations("app");
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [preview, setPreview] = useState<Answers | null>(null);
  const [useImport, setUseImport] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The public preview keeps answers in sessionStorage; offer them once, never upload silently.
  useEffect(() => {
    const saved = loadState();
    if (saved && (saved.answers.projectType || saved.answers.projectDescription.trim())) {
      setPreview(saved.answers);
      setIdea((current) => current || saved.answers.projectDescription);
    }
  }, []);

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (idea.trim().length < 10) {
      setError(t("newProject.tooShort"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startProjectAction({
        idea: idea.trim(),
        locale,
        imported: preview && useImport ? JSON.parse(JSON.stringify(preview)) : undefined,
      });
      if (!result.ok) {
        setError(
          result.code === "VALIDATION_ERROR"
            ? t("newProject.tooShort")
            : t(`errors.${result.code}`),
        );
        return;
      }
      if (preview && useImport) clearState();
      router.push(`/project/${result.data.slug}/interview`);
    });
  }

  const examples = t.raw("newProject.exampleList") as string[];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-busy={pending}>
      {preview ? (
        <div className="rounded-lg border border-info/40 bg-surface p-4">
          <p className="font-medium">{t("newProject.importTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("newProject.importBody")}</p>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={t("newProject.importTitle")}
          >
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={useImport === value}
                onClick={() => setUseImport(value)}
                className="min-h-11 rounded-md border border-border px-4 text-sm aria-checked:border-primary aria-checked:text-foreground"
              >
                {value ? t("newProject.import") : t("newProject.skipImport")}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <TextArea
        id={`${id}-idea`}
        label={t("newProject.label")}
        placeholder={t("newProject.placeholder")}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={4}
        maxLength={2000}
        error={error ?? undefined}
        required
      />
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{t("newProject.examples")}</p>
        <ul className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => setIdea(example)}
                className="min-h-11 rounded-md border border-border px-3 text-left text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {error && error !== t("newProject.tooShort") ? <Notice tone="error">{error}</Notice> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("newProject.pending") : t("newProject.submit")}
      </Button>
    </form>
  );
}
