"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState, useTransition } from "react";
import { importProjectAction } from "@/app/[locale]/(app)/dashboard/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { GithubConnect, type GithubState } from "./github-connect";

/** Starts a project from an existing GitHub repository; the interview arrives pre-filled. */
export function ImportProjectForm({ github }: { github: GithubState }) {
  const t = useTranslations("app");
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [docsPath, setDocsPath] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const connected = github.login !== null;

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);
    setDocsError(null);
    setError(null);
    if (repo.trim().length < 3) {
      setFieldError(t("newProject.github.errors.invalid"));
      return;
    }
    startTransition(async () => {
      const result = await importProjectAction({
        repo: repo.trim(),
        // A connected account supplies the token on the server; a pasted one is the fallback.
        token: connected ? undefined : token.trim() || undefined,
        useConnection: connected,
        useAi,
        docsPath: docsPath.trim() || undefined,
        locale,
      });
      if (!result.ok) {
        if (result.fields?.docsPath) {
          setDocsError(t("newProject.github.errors.docsPath"));
          return;
        }
        const code = result.fields?.repo;
        if (code)
          setFieldError(
            t.has(`newProject.github.errors.${code}`)
              ? t(`newProject.github.errors.${code}`)
              : t("newProject.github.errors.provider_error"),
          );
        else setError(t(`errors.${result.code}`));
        return;
      }
      // The token has done its job: it is now stored encrypted by the repository connection.
      setToken("");
      // A ready workspace needs no interview; only unresolved conflicts send the user there.
      // The system may already be built, in review or live: first ask how far it is. If the
      // documents held no PRD, that page also says where to give one.
      const { slug, completed } = result.data;
      router.push(completed ? `/project/${slug}/progress` : `/project/${slug}/interview`);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-busy={pending}>
      <p className="text-muted-foreground">{t("newProject.github.body")}</p>
      <GithubConnect github={github} onPick={setRepo} />
      <Field
        id={`${id}-repo`}
        name="repo"
        label={t("newProject.github.repoLabel")}
        placeholder={t("newProject.github.repoPlaceholder")}
        hint={t("newProject.github.repoHint")}
        value={repo}
        onChange={(e) => setRepo(e.target.value)}
        error={fieldError ?? undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={300}
        required
      />
      {connected ? null : (
        <Field
          id={`${id}-token`}
          name="token"
          type="password"
          label={t("newProject.github.tokenLabel")}
          placeholder={t("newProject.github.tokenPlaceholder")}
          hint={t("newProject.github.tokenHint")}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          maxLength={500}
        />
      )}
      <Field
        id={`${id}-docs`}
        name="docsPath"
        label={t("newProject.github.docsLabel")}
        placeholder="docs"
        hint={t("newProject.github.docsHint")}
        value={docsPath}
        onChange={(e) => setDocsPath(e.target.value)}
        error={docsError ?? undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
      />
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={useAi}
          onChange={(e) => setUseAi(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>
          <span className="font-medium">{t("newProject.github.aiLabel")}</span>
          <span className="mt-1 block text-muted-foreground">{t("newProject.github.aiHint")}</span>
        </span>
      </label>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("newProject.github.pending") : t("newProject.github.submit")}
      </Button>
    </form>
  );
}

export type { GithubState };
