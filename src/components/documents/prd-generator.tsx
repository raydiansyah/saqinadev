"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  enhancePrdSectionAction,
  savePrdBriefAction,
} from "@/app/[locale]/(app)/project/[slug]/prd/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import { Link, useRouter } from "@/i18n/navigation";
import { type PrdBrief, renderPrd } from "@/lib/prd/brief";
import type { PrdBriefView } from "@/lib/prd/service";
import { cn } from "@/lib/utils";

const MarkdownPreview = dynamic(() => import("./markdown-preview"));

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; model: string; rules: boolean };

/**
 * Generate PRD: one field per section, filled from the project. Enhance asks the model (or the
 * rules, when none is set up) to make a section more specific; nothing is saved until Save.
 */
export function PrdGenerator({ slug, view }: { slug: string; view: PrdBriefView }) {
  const t = useTranslations("documents.prdGenerate");
  const errors = useTranslations("app.errors");
  const id = useId();
  const router = useRouter();
  const [brief, setBrief] = useState<PrdBrief>(view.brief);
  const [status, setStatus] = useState<Status[]>(() =>
    view.brief.sections.map(() => ({ kind: "idle" })),
  );
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [all, setAll] = useState(false);
  const [saving, startSave] = useTransition();

  const setBody = (i: number, body: string) =>
    setBrief((b) => ({ ...b, sections: b.sections.map((s, j) => (j === i ? { ...s, body } : s)) }));
  const setOne = (i: number, s: Status) =>
    setStatus((list) => list.map((x, j) => (j === i ? s : x)));

  async function enhance(i: number, current: PrdBrief): Promise<PrdBrief | null> {
    setOne(i, { kind: "busy" });
    const result = await enhancePrdSectionAction(slug, { brief: current, index: i });
    if (!result.ok) {
      setOne(i, { kind: "idle" });
      setError(errors(result.code as "INTERNAL_ERROR"));
      return null;
    }
    setOne(i, { kind: "done", model: result.data.model, rules: result.data.deterministic });
    const next = {
      ...current,
      sections: current.sections.map((s, j) => (j === i ? { ...s, body: result.data.body } : s)),
    };
    setBrief(next);
    return next;
  }

  async function enhanceAll() {
    setError(null);
    setAll(true);
    let current = brief;
    // One section at a time, each building on the sections already improved.
    for (let i = 0; i < current.sections.length; i++) {
      const next = await enhance(i, current);
      if (!next) break;
      current = next;
    }
    setAll(false);
  }

  function save() {
    setError(null);
    startSave(async () => {
      const result = await savePrdBriefAction(slug, { brief, baseVersion: view.baseVersion });
      if (!result.ok) {
        const stale = result.fields && Object.values(result.fields).includes("stale");
        setError(stale ? t("stale") : errors(result.code as "INTERNAL_ERROR"));
        return;
      }
      router.push(`/project/${slug}/prd`);
    });
  }

  const busy = all || saving || status.some((s) => s.kind === "busy");

  return (
    <section aria-labelledby={`${id}-h`} className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="font-semibold">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(`source.${view.source}`)}</p>
        </div>
        <Link
          href={`/project/${slug}/prd`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {t("cancel")}
        </Link>
      </div>
      {view.baseVersion !== null ? (
        <Notice tone="info" className="mt-3">
          {t("newVersion")}
        </Notice>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={enhanceAll}>
          {all ? t("enhancingAll") : t("enhanceAll")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={preview}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? t("edit") : t("preview")}
        </Button>
      </div>

      {preview ? (
        <div className="mt-4 rounded-md border border-border p-4">
          <MarkdownPreview content={renderPrd(brief)} />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <Field
            id={`${id}-title`}
            label={t("docTitle")}
            value={brief.title}
            onChange={(e) => setBrief((b) => ({ ...b, title: e.target.value }))}
            maxLength={200}
            required
          />
          {brief.sections.map((s, i) => {
            const st = status[i] ?? { kind: "idle" };
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: sections are never added, removed or reordered here, and headings may repeat
              <div key={i} aria-busy={st.kind === "busy"}>
                <TextArea
                  id={`${id}-s${i}`}
                  label={`${i + 1}. ${s.heading}`}
                  value={s.body}
                  onChange={(e) => setBody(i, e.target.value)}
                  rows={Math.min(14, Math.max(4, s.body.split("\n").length + 1))}
                  className="font-mono text-sm"
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      void enhance(i, brief);
                    }}
                  >
                    {st.kind === "busy" ? t("enhancing") : t("enhance")}
                    <span className="sr-only">: {s.heading}</span>
                  </Button>
                  {st.kind === "done" ? (
                    <span
                      role="status"
                      className={cn("text-xs", st.rules ? "text-muted-foreground" : "text-success")}
                    >
                      {st.rules ? t("byRules") : t("byModel", { model: st.model })}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Link href={`/project/${slug}/prd`} className={buttonVariants({ variant: "ghost" })}>
          {t("cancel")}
        </Link>
        <Button disabled={busy || brief.title.trim().length < 2} onClick={save}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </section>
  );
}
