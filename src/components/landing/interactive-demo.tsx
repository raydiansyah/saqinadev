"use client";

import { useLocale } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";
import { Container } from "@/components/primitives/container";
import { Button } from "@/components/ui/button";
import type { SiteContent } from "@/content/site";
import type { Locale } from "@/i18n/locales";
import { useRouter } from "@/i18n/navigation";
import { createRuleBasedEngine, type InterviewEngine } from "@/lib/interview/engine";
import { findProfile } from "@/lib/interview/profiles";
import { answersFromIdea } from "@/lib/interview/rules/preview";
import { EMPTY_ANSWERS } from "@/lib/interview/types";

type DemoContent = SiteContent["demo"];

function readIdea(idea: string, engine: InterviewEngine, c: DemoContent) {
  const answers = answersFromIdea(idea, EMPTY_ANSWERS);
  const rec = engine.recommend(answers);
  const profile = findProfile(idea);
  const profileCopy = profile ? engine.copy.profiles[profile.id] : undefined;
  const layers = engine.copy.recommend.stack.layers;
  const stack = Object.fromEntries(rec.stack.value.map((s) => [s.layer, s.value]));
  const r = c.rows;
  return {
    answers,
    matched: !!profile,
    rows: [
      [r.type, profileCopy?.label ?? rec.projectLabel],
      [r.users, profileCopy?.users.join(" · ") ?? r.usersUnknown],
      [r.frontend, stack[layers.frontend] ?? stack[layers.api] ?? "Next.js"],
      [r.backend, stack[layers.api] ?? r.backendValue],
      [r.database, rec.database.value],
      [
        r.auth,
        answers.features.includes("rbac")
          ? r.authRoles
          : answers.features.includes("auth")
            ? r.authEmail
            : r.authNone,
      ],
      [r.development, engine.copy.options.developmentMode[rec.development.value].label],
      [
        r.landing,
        rec.landing
          ? [rec.landing.primary, ...rec.landing.supporting]
              .map((id) => engine.copy.concepts[id].name)
              .join(" + ")
          : r.noLanding,
      ],
    ] as const,
    reason: rec.landing?.reason ?? rec.development.reason,
  };
}

/** A small, honest simulation of the interview: deterministic, local, nothing stored. */
export function InteractiveDemo({ content: c }: { content: DemoContent }) {
  const locale = useLocale() as Locale;
  const engine = useMemo(() => createRuleBasedEngine(locale), [locale]);
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [idea, setIdea] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [starting, setStarting] = useState(false);
  const result = useMemo(() => (idea ? readIdea(idea, engine, c) : null), [idea, engine, c]);

  const submit = (text: string) => {
    if (text.trim().length < 6) {
      setError(true);
      return;
    }
    setError(false);
    setAccepted(false);
    setDraft(text);
    setIdea(text.trim());
  };

  const startProject = async () => {
    if (!result) return;
    setStarting(true);
    // Only the idea and its type carry over; features are confirmed in the interview.
    const [{ saveState }, { INITIAL_STATE }] = await Promise.all([
      import("@/lib/interview/storage"),
      import("@/lib/interview/state"),
    ]);
    saveState({
      ...INITIAL_STATE,
      answers: {
        ...INITIAL_STATE.answers,
        projectDescription: result.answers.projectDescription,
        projectType: result.answers.projectType,
      },
    });
    router.push("/dashboard/new");
  };

  return (
    <section
      id="try"
      aria-labelledby="demo-heading"
      className="border-t border-border py-20 sm:py-28"
    >
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <h2
            id="demo-heading"
            className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {c.title}
          </h2>
          <p className="mt-4 text-muted-foreground">{c.body}</p>
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
          >
            <label htmlFor={inputId} className="mb-2 block font-medium">
              {c.label}
            </label>
            <textarea
              id={inputId}
              ref={inputRef}
              rows={3}
              maxLength={500}
              value={draft}
              placeholder={c.placeholder}
              aria-describedby={error ? `${inputId}-error` : undefined}
              aria-invalid={error || undefined}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full resize-y rounded-md border border-border-strong bg-surface px-3.5 py-3 text-[0.9375rem] leading-relaxed placeholder:text-subtle-foreground focus-visible:border-primary"
            />
            {error ? (
              <p id={`${inputId}-error`} className="mt-2 text-sm text-warning">
                {c.error}
              </p>
            ) : null}
            <Button type="submit" className="mt-3">
              {c.submit}
            </Button>
          </form>
          <div className="mt-8">
            <p className="text-sm text-muted-foreground">{c.tryOne}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {c.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => submit(example)}
                    className="min-h-11 w-full rounded-md border border-border px-3.5 text-left text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div aria-live="polite" className="self-start">
          {result ? (
            <div className="rounded-lg border border-border bg-surface">
              <p className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="font-mono text-xs text-primary">{c.understood}</span>
                {accepted ? (
                  <span className="font-mono text-xs text-success">{c.accepted}</span>
                ) : null}
              </p>
              <dl className="divide-y divide-border px-5">
                {result.rows.map(([label, value]) => (
                  <div key={label} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-border px-5 py-4">
                <p className="text-sm font-medium">{c.why}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {result.reason}
                </p>
                {!result.matched ? (
                  <p className="mt-2 text-sm text-muted-foreground">{c.unmatched}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row">
                <Button variant="ghost" onClick={() => inputRef.current?.focus()}>
                  {c.edit}
                </Button>
                <Button variant="outline" onClick={() => setAccepted(true)} disabled={accepted}>
                  {c.accept}
                </Button>
                <Button onClick={startProject} disabled={starting}>
                  {starting ? c.starting : c.start}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-border-strong p-8 text-center">
              <p className="max-w-xs text-sm text-muted-foreground">{c.empty}</p>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
