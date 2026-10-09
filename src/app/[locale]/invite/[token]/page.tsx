import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AcceptInvite } from "@/components/portal/accept-invite";
import { Logo } from "@/components/primitives/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { getActor } from "@/lib/auth/server";
import { previewInvitation } from "@/lib/clients/invitations";
import { signOutForInviteAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  // The URL carries a secret: keep it out of indexes and referrers.
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function InvitePage({ params }: PageProps<"/[locale]/invite/[token]">) {
  const { locale, token } = (await params) as { locale: Locale; token: string };
  const [invite, actor, t] = await Promise.all([
    previewInvitation(token),
    getActor(),
    getTranslations("invite"),
  ]);
  const next = `/${locale}/invite/${token}`;
  const email = invite.email ?? "";
  const matches = actor !== null && actor.email.toLowerCase() === email.toLowerCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-sm">
          <Logo />
        </Link>
        <LanguageSwitcher />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-5 pt-8 pb-16 sm:pt-16">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 sm:p-8">
          {invite.state !== "valid" ? (
            <>
              <h1 className="text-xl font-semibold text-balance">
                {t(`states.${invite.state}.title`)}
              </h1>
              <p className="mt-3 text-muted-foreground">{t(`states.${invite.state}.body`)}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {invite.state === "used" ? (
                  <Link
                    href={
                      actor
                        ? "/portal"
                        : { pathname: "/sign-in", query: { next: `/${locale}/portal` } }
                    }
                    className={buttonVariants()}
                  >
                    {actor ? t("goPortal") : t("signIn")}
                  </Link>
                ) : null}
                <Link href="/" className={buttonVariants({ variant: "ghost" })}>
                  {t("backHome")}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="font-mono text-xs text-subtle-foreground">{t("title")}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("heading")}</h1>
              <p className="mt-3 break-words text-muted-foreground">
                {t("intro", { org: invite.orgName ?? "", client: invite.clientName ?? "" })}
              </p>
              <dl className="mt-5 rounded-md border border-border px-4 py-3">
                <dt className="text-sm text-muted-foreground">{t("invitedEmail")}</dt>
                <dd className="mt-0.5 font-medium break-all">{email}</dd>
              </dl>
              <div className="mt-6">
                {!actor ? (
                  <>
                    <p className="mb-4 text-sm text-muted-foreground">{t("signedOutHint")}</p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Link
                        href={{ pathname: "/sign-up", query: { next } }}
                        className={buttonVariants({ className: "flex-1" })}
                      >
                        {t("createAccount")}
                      </Link>
                      <Link
                        href={{ pathname: "/sign-in", query: { next } }}
                        className={buttonVariants({ variant: "outline", className: "flex-1" })}
                      >
                        {t("signIn")}
                      </Link>
                    </div>
                  </>
                ) : matches ? (
                  <>
                    <p className="mb-4 text-sm break-all text-muted-foreground">
                      {t("signedInAs", { email: actor.email })}
                    </p>
                    <AcceptInvite token={token} />
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-sm break-words text-muted-foreground" role="status">
                      {t("wrongEmail", { invited: email, current: actor.email })}
                    </p>
                    <form action={signOutForInviteAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="token" value={token} />
                      <Button type="submit" variant="outline" className="w-full">
                        {t("signOut")}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
