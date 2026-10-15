"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState, useTransition } from "react";
import { importProjectAction } from "@/app/[locale]/(app)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";

/** Starts a project from an existing GitHub repository; the interview arrives pre-filled. */
export function ImportProjectForm() {
  const t = useTranslations("app");
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);
    setError(null);
    if (repo.trim().length < 3) {
      setFieldError(t("newProject.github.errors.invalid"));
      return;
    }
    startTransition(async () => {
      const result = await importProjectAction({
        repo: repo.trim(),
        token: token.trim() || undefined,
        useAi,
        locale,
      });
      if (!result.ok) {
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
      router.push(`/project/${result.data.slug}/interview`);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-busy={pending}>
      <p className="text-muted-foreground">{t("newProject.github.body")}</p>
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
