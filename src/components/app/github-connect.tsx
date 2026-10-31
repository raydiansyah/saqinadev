"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { disconnectGithubAction } from "@/app/[locale]/(app)/dashboard/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
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

/** "Connect with GitHub", the repository picker, and the way to disconnect. */
export function GithubConnect({
  github,
  onPick,
  next,
}: {
  github: GithubState;
  onPick: (fullName: string) => void;
  /** The page to come back to after GitHub (a path of the app); the import form by default. */
  next?: string;
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
            href={`/api/github/connect?locale=${locale}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("newProject.github.connect")}
          </a>
        </>
      ) : null}
    </section>
  );
}
