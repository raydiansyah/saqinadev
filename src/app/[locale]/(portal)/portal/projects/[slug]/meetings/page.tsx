import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/states";
import { NoteActions } from "@/components/portal/engagement/note-actions";
import { NoteForm } from "@/components/portal/engagement/note-form";
import { type BadgeTone, StatusBadge } from "@/components/portal/engagement/status-badge";
import { formatDate, formatDay } from "@/components/portal/format";
import { clientNoteList } from "@/lib/portal/engagement-views";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portalEngagement.meetings");
  return { title: t("title") };
}

const STATUS_TONE: Record<"pending_review" | "accepted" | "declined", BadgeTone> = {
  pending_review: "waiting",
  accepted: "good",
  declined: "bad",
};

export default async function PortalMeetingsPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/meetings">) {
  const { slug } = await params;
  const notes = await clientNoteList(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([
    getTranslations("portalEngagement.meetings"),
    getLocale(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">{t("description")}</p>
      </div>

      <NoteForm slug={slug} />

      <section aria-labelledby="notes-heading" className="space-y-3">
        <h3 id="notes-heading" className="font-medium">
          {t("listTitle")}
        </h3>
        {notes.length === 0 ? (
          <EmptyState title={t("listTitle")} body={t("empty")} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {notes.map((n) => (
              <li key={n.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 font-medium break-words">{n.title}</p>
                  {n.status ? (
                    <StatusBadge label={t(`status.${n.status}`)} tone={STATUS_TONE[n.status]} />
                  ) : null}
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{formatDay(n.meetingDate, locale)}</span>
                  <span>{t(`from.${n.side}`)}</span>
                </p>
                {n.attendees ? (
                  <p className="text-sm text-muted-foreground">
                    {t("attendees")}: {n.attendees}
                  </p>
                ) : null}
                <p className="text-sm break-words whitespace-pre-line">{n.body}</p>
                {n.reviewNote ? (
                  <p className="rounded-md border border-border-strong px-3 py-2 text-sm">
                    <span className="font-medium">{t("reasonLabel")}: </span>
                    {n.reviewNote}
                  </p>
                ) : null}
                {n.confirmedAt ? (
                  <p className="text-sm text-success">
                    {t("confirmed", { date: formatDate(n.confirmedAt, locale) })}
                  </p>
                ) : null}
                <NoteActions
                  slug={slug}
                  id={n.id}
                  canConfirm={n.side === "team" && !n.confirmedAt}
                  canWithdraw={n.status === "pending_review"}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
