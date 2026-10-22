"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  choosePrdAction,
  createPrdFromTextAction,
} from "@/app/[locale]/(app)/project/[slug]/prd/actions";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Notice, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export interface PrdOption {
  slug: string;
  title: string;
  path: string;
}

const MAX_UPLOAD_BYTES = 200_000;

/**
 * The project has no PRD: pick one of the repository's documents, or paste or upload the text.
 * Nothing is generated; a PRD that is not given stays empty.
 */
export function PrdPicker({ slug, options }: { slug: string; options: PrdOption[] }) {
  const t = useTranslations("documents.prdAsk");
  const errors = useTranslations("app.errors");
  const id = useId();
  const [mode, setMode] = useState<"repo" | "text">(options.length > 0 ? "repo" : "text");
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const { pending, error, run } = useRun();

  async function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) return setFileError(t("fileType"));
    if (file.size > MAX_UPLOAD_BYTES) return setFileError(t("fileSize"));
    // Into the text box, so the person sees what will be saved before saving it.
    setText(await file.text());
  }

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 id={`${id}-h`} className="text-base font-medium">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t("body")}</p>
      </div>
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-2">
        {(["repo", "text"] as const)
          .filter((m) => m === "text" || options.length > 0)
          .map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "min-h-11 rounded-md border px-4 text-sm font-medium",
                mode === m ? "border-primary bg-primary/10" : "border-border-strong",
              )}
            >
              {t(m === "repo" ? "tabRepo" : "tabText")}
            </button>
          ))}
      </div>

      {mode === "repo" ? (
        <Select
          id={`${id}-doc`}
          label={t("label")}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">{t("placeholder")}</option>
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.path}
            </option>
          ))}
        </Select>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-file`} className="mb-1.5 block text-sm font-medium">
              {t("upload")}
            </label>
            <input
              id={`${id}-file`}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-4"
            />
            {fileError ? <p className="mt-1.5 text-sm text-error">{fileError}</p> : null}
          </div>
          <div>
            <label htmlFor={`${id}-text`} className="mb-1.5 block text-sm font-medium">
              {t("paste")}
            </label>
            <textarea
              id={`${id}-text`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              maxLength={200_000}
              spellCheck={false}
              placeholder={t("pastePlaceholder")}
              className={cn(FIELD_CLASS, "min-h-40 py-2.5 font-mono")}
            />
          </div>
        </div>
      )}

      {error ? (
        <Notice tone="error">
          {error.field === "prd_exists" ? t("exists") : errors(error.code as "INTERNAL_ERROR")}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {mode === "repo" ? (
          <Button
            disabled={!choice || pending}
            onClick={() => run(() => choosePrdAction(slug, choice))}
          >
            {t("submit")}
          </Button>
        ) : (
          <Button
            disabled={text.trim().length < 10 || pending}
            onClick={() => run(() => createPrdFromTextAction(slug, text))}
          >
            {t("saveText")}
          </Button>
        )}
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      </div>
    </section>
  );
}
