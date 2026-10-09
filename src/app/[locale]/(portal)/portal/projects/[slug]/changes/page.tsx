import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { ChangeDecision } from "@/components/portal/engagement/change-decision";
import { type BadgeTone, StatusBadge } from "@/components/portal/engagement/status-badge";
import { formatDate } from "@/components/portal/format";
import { crNumber } from "@/lib/change-requests/service";
import { formatMoney } from "@/lib/money";
import { clientChangeRequestList } from "@/lib/portal/engagement-views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portalEngagement.changes");
  return { title: t("metaTitle") };
}

type ClientStatus = "sent" | "approved" | "rejected" | "done";

const TONE: Record<ClientStatus, BadgeTone> = {
  sent: "waiting",
  approved: "good",
  rejected: "bad",
  done: "neutral",
};

export default async function PortalChangesPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/changes">) {
  const { slug } = await params;
  const changes = await clientChangeRequestList(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([getTranslations("portalEngagement.changes"), getLocale()]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">{t("description")}</p>
      </div>
      {changes.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <ul className="space-y-4">
          {changes.map((cr) => {
            const status = cr.status as ClientStatus;
            const number = crNumber(cr.number);
            const cost = formatMoney(cr.additionalCost, cr.currency, locale);
            const days = t("days", { count: cr.additionalDays });
            return (
              <li key={cr.id} className="space-y-4 rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 font-medium break-words">
                    <span className="font-mono text-muted-foreground">{number}</span> {cr.title}
                  </h3>
                  <StatusBadge label={t(`status.${status}`)} tone={TONE[status] ?? "neutral"} />
                </div>
                {cr.description ? (
                  <p className="text-sm break-words whitespace-pre-line">{cr.description}</p>
                ) : null}
                {cr.impact ? (
                  <div className="text-sm">
                    <p className="text-muted-foreground">{t("impactLabel")}</p>
                    <p className="mt-1 break-words whitespace-pre-line">{cr.impact}</p>
                  </div>
                ) : null}
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border px-4 py-3">
                    <dt className="text-sm text-muted-foreground">{t("costLabel")}</dt>
                    <dd className="mt-1 font-mono break-words">{cost}</dd>
                  </div>
                  <div className="rounded-md border border-border px-4 py-3">
                    <dt className="text-sm text-muted-foreground">{t("daysLabel")}</dt>
                    <dd className="mt-1 font-mono">{days}</dd>
                  </div>
                </dl>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {cr.sentAt ? (
                    <span>{t("sentOn", { date: formatDate(cr.sentAt, locale) })}</span>
                  ) : null}
                  {cr.decidedAt ? (
                    <span>{t("decidedOn", { date: formatDate(cr.decidedAt, locale) })}</span>
                  ) : null}
                </p>
                {status === "sent" ? (
                  <ChangeDecision slug={slug} id={cr.id} number={number} cost={cost} days={days} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
