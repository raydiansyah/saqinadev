import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { ApprovalRespond } from "@/components/portal/engagement/approval-respond";
import { type BadgeTone, StatusBadge } from "@/components/portal/engagement/status-badge";
import { formatDate } from "@/components/portal/format";
import { Link } from "@/i18n/navigation";
import type { ClientApprovalView } from "@/lib/portal/engagement-views";
import { clientApprovalList } from "@/lib/portal/engagement-views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portalEngagement.approvals");
  return { title: t("metaTitle") };
}

const TONE: Record<string, BadgeTone> = {
  pending: "waiting",
  approved: "good",
  changes_requested: "bad",
};

/** Only http(s) links are rendered as links; anything else stays hidden. */
const safeLink = (link: string | null) => (link && /^https?:\/\//i.test(link) ? link : null);

export default async function PortalApprovalsPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/approvals">) {
  const { slug } = await params;
  const approvals = await clientApprovalList(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([
    getTranslations("portalEngagement.approvals"),
    getLocale(),
  ]);
  const waiting = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending");

  const card = (a: ClientApprovalView) => {
    const link = safeLink(a.link);
    return (
      <li key={a.id} className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="min-w-0 font-medium break-words">{a.title}</h4>
          <StatusBadge
            label={t(`status.${a.status as "pending" | "approved" | "changes_requested"}`)}
            tone={TONE[a.status] ?? "neutral"}
          />
        </div>
        {a.description ? (
          <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
            {a.description}
          </p>
        ) : null}
        {a.documentSlug || link ? (
          <div className="flex flex-col gap-1 text-sm">
            {a.documentSlug ? (
              <Link
                href={`/portal/projects/${slug}/documents/${a.documentSlug}`}
                className="inline-flex min-h-11 items-center break-words text-primary underline-offset-4 hover:underline"
              >
                {t("openDocument", { title: a.documentTitle ?? a.documentSlug })}
              </Link>
            ) : null}
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center break-all text-primary underline-offset-4 hover:underline"
              >
                {t("openLink")}
              </a>
            ) : null}
          </div>
        ) : null}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{t("requestedOn", { date: formatDate(a.createdAt, locale) })}</span>
          {a.respondedAt ? (
            <span>{t("respondedOn", { date: formatDate(a.respondedAt, locale) })}</span>
          ) : null}
        </p>
        {a.responseNote ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm">
            <p className="text-muted-foreground">{t("yourNote")}</p>
            <p className="mt-1 break-words whitespace-pre-line">{a.responseNote}</p>
          </div>
        ) : null}
        {a.status === "pending" ? <ApprovalRespond slug={slug} id={a.id} /> : null}
      </li>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">{t("description")}</p>
      </div>
      {approvals.length === 0 ? (
        <EmptyState title={t("title")} body={t("empty")} />
      ) : (
        <>
          {waiting.length > 0 ? (
            <section aria-labelledby="approvals-waiting" className="space-y-3">
              <h3 id="approvals-waiting" className="font-medium">
                {t("waiting")}
              </h3>
              <ul className="space-y-4">{waiting.map(card)}</ul>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}
          {history.length > 0 ? (
            <section aria-labelledby="approvals-history" className="space-y-3">
              <h3 id="approvals-history" className="font-medium">
                {t("history")}
              </h3>
              <ul className="space-y-4">{history.map(card)}</ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
