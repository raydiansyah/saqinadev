import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { RequestForm } from "@/components/portal/engagement/request-form";
import { type BadgeTone, StatusBadge } from "@/components/portal/engagement/status-badge";
import { formatDate } from "@/components/portal/format";
import { REQUEST_KINDS, type RequestKind, type RequestStatus } from "@/lib/domain/business";
import { clientRequestList } from "@/lib/portal/engagement-views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portalEngagement.requests");
  return { title: t("metaTitle") };
}

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  open: "neutral",
  in_review: "waiting",
  resolved: "good",
  declined: "bad",
  converted: "neutral",
};

const isKind = (value: unknown): value is RequestKind =>
  typeof value === "string" && (REQUEST_KINDS as readonly string[]).includes(value);

export default async function PortalRequestsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/portal/projects/[slug]/requests">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const requests = await clientRequestList(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([
    getTranslations("portalEngagement.requests"),
    getLocale(),
  ]);
  const defaultKind = isKind(query.kind) ? query.kind : "question";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">{t("description")}</p>
      </div>

      <RequestForm key={defaultKind} slug={slug} defaultKind={defaultKind} />

      <section aria-labelledby="requests-heading" className="space-y-3">
        <h3 id="requests-heading" className="font-medium">
          {t("listTitle")}
        </h3>
        {requests.length === 0 ? (
          <EmptyState title={t("listTitle")} body={t("empty")} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {requests.map((r) => (
              <li key={r.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 font-medium break-words">{r.title}</p>
                  <StatusBadge label={t(`status.${r.status}`)} tone={STATUS_TONE[r.status]} />
                </div>
                {r.body ? (
                  <p className="line-clamp-3 text-sm break-words whitespace-pre-line text-muted-foreground">
                    {r.body}
                  </p>
                ) : null}
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{t(`kinds.${r.kind}`)}</span>
                  <span>{t("sentOn", { date: formatDate(r.createdAt, locale) })}</span>
                </p>
                {r.classification && r.classification !== "unclassified" ? (
                  <p className="text-sm">{t(`classification.${r.classification}`)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
