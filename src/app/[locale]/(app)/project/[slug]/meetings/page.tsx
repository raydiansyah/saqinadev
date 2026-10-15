import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeading } from "@/components/app/states";
import { MeetingNotesPanel, NewNoteButton } from "@/components/meetings/meeting-notes-panel";
import { can } from "@/lib/auth/permissions";
import { listItemsByNote } from "@/lib/meetings/analyze";
import { listNotes } from "@/lib/meetings/notes";
import { projectPageAccess } from "@/lib/projects/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meetings");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function MeetingsPage({
  params,
}: PageProps<"/[locale]/project/[slug]/meetings">) {
  const { slug } = await params;
  const access = await projectPageAccess(slug);
  const [t, notes] = await Promise.all([getTranslations("meetings"), listNotes(access.project.id)]);
  const items = await listItemsByNote(
    notes.filter((n) => n.status === "analyzed").map((n) => n.id),
  );
  const canWrite = can(access.role, "content:write");

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("description")}
        actions={canWrite ? <NewNoteButton slug={slug} /> : undefined}
      />
      <MeetingNotesPanel
        slug={slug}
        canWrite={canWrite}
        notes={notes.map((n) => ({
          id: n.id,
          title: n.title,
          meetingDate: n.meetingDate,
          attendees: n.attendees,
          body: n.body,
          side: n.side,
          visibility: n.visibility,
          status: n.status,
          reviewNote: n.reviewNote,
          confirmed: n.clientConfirmedAt !== null,
          items: (items.get(n.id) ?? []).map((i) => ({
            id: i.id,
            text: i.text,
            quote: i.quote,
            classification: i.classification,
            confidence: i.confidence,
            rationale: i.rationale,
          })),
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
