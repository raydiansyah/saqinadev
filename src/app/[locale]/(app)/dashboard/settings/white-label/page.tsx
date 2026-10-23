import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/lib/auth/server";
import { formatLongDate } from "@/lib/format";
import { isPlatformOwner } from "@/lib/platform/roles";
import { WHITE_LABEL_MAY, WHITE_LABEL_NEVER } from "@/lib/white-label/policy";
import { listWhiteLabel } from "@/lib/white-label/service";
import { WhiteLabelAdmin } from "./white-label-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.whiteLabel");
  return { title: t("title"), robots: { index: false } };
}

/** What the white-label policy says, and whether it is open for each of your organizations. */
export default async function WhiteLabelPage() {
  const actor = await requireActorPage("/dashboard/settings/white-label");
  const [t, locale, owner, orgs] = await Promise.all([
    getTranslations("app.whiteLabel"),
    getLocale(),
    isPlatformOwner(actor),
    listWhiteLabel(actor),
  ]);

  return (
    <>
      <PageHeading title={t("title")} description={t("intro")} />
      <div className="max-w-3xl space-y-8">
        <section aria-labelledby="wl-how" className="rounded-lg border border-border p-5">
          <h2 id="wl-how" className="font-medium">
            {t("how.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("how.body")}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>{t("how.paidPlan")}</li>
            <li>{t("how.agreement")}</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">{t("how.closes")}</p>
        </section>

        <section aria-labelledby="wl-status" className="rounded-lg border border-border p-5">
          <h2 id="wl-status" className="font-medium">
            {t("status.title")}
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {orgs.map((o) => (
              <li key={o.organizationId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{o.name}</span>
                  <span
                    className={
                      o.state.unlocked
                        ? "rounded-sm border border-success/40 px-1.5 py-0.5 font-mono text-xs text-success"
                        : "rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                    }
                  >
                    {o.state.unlocked ? t("status.open") : t("status.locked")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {o.state.unlocked
                    ? t("status.openBy", {
                        basis: t(`bases.${o.state.basis}`),
                        reference: o.state.reference,
                        until: o.state.validUntil
                          ? formatLongDate(o.state.validUntil, locale)
                          : t("status.noEnd"),
                      })
                    : t(`status.why.${o.state.reason}`)}
                </p>
              </li>
            ))}
          </ul>
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("status.none")}</p>
          ) : null}
        </section>

        <section aria-labelledby="wl-rules" className="rounded-lg border border-border p-5">
          <h2 id="wl-rules" className="font-medium">
            {t("rules.title")}
          </h2>
          <div className="mt-3 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">{t("rules.mayTitle")}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {WHITE_LABEL_MAY.map((k) => (
                  <li key={k}>{t(`rules.may.${k}`)}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium">{t("rules.neverTitle")}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {WHITE_LABEL_NEVER.map((k) => (
                  <li key={k}>{t(`rules.never.${k}`)}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-sm">
            <Link href="/dashboard/docs/white-label-policy" className="text-primary underline">
              {t("rules.readPolicy")}
            </Link>
          </p>
        </section>

        {owner ? (
          <WhiteLabelAdmin
            orgs={orgs.map((o) => ({
              id: o.organizationId,
              name: o.name,
              open: o.state.unlocked,
            }))}
          />
        ) : null}
      </div>
    </>
  );
}
