import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { signOutAction } from "@/app/[locale]/(app)/actions";
import { PageHeading } from "@/components/app/states";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { planDeletion } from "@/lib/account/delete";
import { requireActorPage } from "@/lib/auth/server";
import { isPlatformOwner } from "@/lib/platform/roles";
import { isRegistrationEnabled } from "@/lib/platform/settings";
import { getUiMode } from "@/lib/users/preferences";
import { AccountDataForm } from "./account-data-form";
import { RegistrationForm } from "./registration-form";
import { WorkspaceModeForm } from "./workspace-mode-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.settings");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AccountSettingsPage() {
  const actor = await requireActorPage("/dashboard/settings");
  const [t, tm, mode, owner] = await Promise.all([
    getTranslations("app"),
    getTranslations("workspaceMode"),
    getUiMode(actor),
    isPlatformOwner(actor),
  ]);
  const plan = await planDeletion(actor);
  const registrationOpen = owner ? await isRegistrationEnabled() : true;
  return (
    <>
      <PageHeading title={t("settings.title")} />
      <div className="max-w-2xl space-y-8">
        <section aria-labelledby="profile-heading" className="rounded-lg border border-border p-5">
          <h2 id="profile-heading" className="font-medium">
            {t("settings.profile")}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">{t("settings.name")}</dt>
            <dd>{actor.name}</dd>
            <dt className="text-muted-foreground">{t("settings.email")}</dt>
            <dd className="break-all">{actor.email}</dd>
          </dl>
        </section>
        <section aria-labelledby="language-heading" className="rounded-lg border border-border p-5">
          <h2 id="language-heading" className="font-medium">
            {t("settings.language")}
          </h2>
          <LanguageSwitcher className="mt-3" />
        </section>
        <section aria-labelledby="mode-heading" className="rounded-lg border border-border p-5">
          <h2 id="mode-heading" className="font-medium">
            {tm("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{tm("description")}</p>
          <WorkspaceModeForm mode={mode} />
        </section>
        <section aria-labelledby="wl-heading" className="rounded-lg border border-border p-5">
          <h2 id="wl-heading" className="font-medium">
            {t("whiteLabel.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("whiteLabel.linkBody")}</p>
          <Link
            href="/dashboard/settings/white-label"
            className={buttonVariants({ variant: "outline", className: "mt-3" })}
          >
            {t("whiteLabel.openPage")}
          </Link>
        </section>
        {owner ? (
          <section
            aria-labelledby="registration-heading"
            className="rounded-lg border border-border p-5"
          >
            <h2 id="registration-heading" className="font-medium">
              {t("settings.registration.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.registration.description")}
            </p>
            <RegistrationForm enabled={registrationOpen} />
          </section>
        ) : null}
        <section aria-labelledby="data-heading" className="rounded-lg border border-border p-5">
          <h2 id="data-heading" className="font-medium">
            {t("settings.account.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.account.description")}</p>
          <AccountDataForm blockers={plan.blockers} sharedProjects={plan.sharedProjects} />
        </section>
        <section aria-labelledby="session-heading" className="rounded-lg border border-border p-5">
          <h2 id="session-heading" className="font-medium">
            {t("settings.session")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.sessionBody")}</p>
          <form action={signOutAction} className="mt-4">
            <input type="hidden" name="locale" value={await getLocale()} />
            <Button type="submit" variant="outline">
              {t("user.signOut")}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
