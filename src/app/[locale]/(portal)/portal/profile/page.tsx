import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { signOutAction } from "@/app/[locale]/(app)/actions";
import { PageHeading } from "@/components/app/states";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { requireActorPage } from "@/lib/auth/server";
import { portalClients } from "@/lib/portal/access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.profile");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PortalProfilePage() {
  const actor = await requireActorPage("/portal/profile");
  const [clients, t, locale] = await Promise.all([
    portalClients(actor),
    getTranslations("portal.profile"),
    getLocale(),
  ]);
  return (
    <>
      <PageHeading title={t("title")} description={t("description")} />
      <div className="max-w-xl space-y-8">
        <section aria-labelledby="account-heading">
          <h2 id="account-heading" className="mb-3 font-medium">
            {t("account")}
          </h2>
          <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
            <div className="px-4 py-3">
              <dt className="text-sm text-muted-foreground">{t("name")}</dt>
              <dd className="mt-0.5 break-words">{actor.name}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-sm text-muted-foreground">{t("email")}</dt>
              <dd className="mt-0.5 break-all">{actor.email}</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="clients-heading">
          <h2 id="clients-heading" className="mb-3 font-medium">
            {t("clients")}
          </h2>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("clientsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {clients.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <p className="break-words">{c.name}</p>
                  {c.company && c.company !== c.name ? (
                    <p className="text-sm break-words text-muted-foreground">{c.company}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="language-heading">
          <h2 id="language-heading" className="mb-1 font-medium">
            {t("language")}
          </h2>
          <LanguageSwitcher />
        </section>
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline">
            {t("signOut")}
          </Button>
        </form>
      </div>
    </>
  );
}
