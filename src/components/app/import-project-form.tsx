"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState, useTransition } from "react";
import {
  disconnectGithubAction,
  importProjectAction,
} from "@/app/[locale]/(app)/dashboard/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { GithubRepoPicker } from "./github-repo-picker";

export interface GithubState {
  /** The platform has a GitHub OAuth App configured. */
  enabled: boolean;
  /** The signed-in user's connected GitHub account, if any. */
  login: string | null;
  /** Outcome of the last connect attempt, from the redirect back from GitHub. */
  flag: string | null;
}

const FLAGS = [
  "denied",
  "invalid_state",
  "exchange_failed",
  "profile_failed",
  "not_configured",
  "rate_limited",
] as const;

/** Starts a project from an existing GitHub repository; the interview arrives pre-filled. */
export function ImportProjectForm({ github }: { github: GithubState }) {
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
  const connected = github.login !== null;

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
        // A connected account supplies the token on the server; a pasted one is the fallback.
        token: connected ? undefined : token.trim() || undefined,
        useConnection: connected,
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

/** "Connect with GitHub", the repository picker, and the way to disconnect. */
function GithubConnect({
  github,
  onPick,
}: {
  github: GithubState;
  onPick: (fullName: string) => void;
}) {
  const t = useTranslations("app");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const flag = (FLAGS as readonly string[]).includes(github.flag ?? "") ? github.flag : null;

  if (!github.enabled && !github.login && !flag) return null;
  return (
    <section
      aria-label={t("newProject.github.connectTitle")}
      className="space-y-3 rounded-lg border border-border p-4"
    >
      {github.flag === "connected" && github.login ? (
        <Notice tone="success">
          {t("newProject.github.flags.connected", { login: github.login })}
        </Notice>
      ) : null}
      {flag ? <Notice tone="error">{t(`newProject.github.flags.${flag}`)}</Notice> : null}
      {github.login ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{t("newProject.github.connectedAs", { login: github.login })}</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await disconnectGithubAction();
                  router.refresh();
                })
              }
            >
              {t("newProject.github.disconnect")}
            </Button>
          </div>
          <GithubRepoPicker onPick={onPick} onDisconnected={() => router.refresh()} />
        </>
      ) : github.enabled ? (
        <>
          <p className="text-sm text-muted-foreground">{t("newProject.github.connectHint")}</p>
          {/* A full navigation: the route sets a cookie and redirects to GitHub. */}
          <a
            href={`/api/github/connect?locale=${locale}`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("newProject.github.connect")}
          </a>
        </>
      ) : null}
    </section>
  );
}
