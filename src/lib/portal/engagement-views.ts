import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { maintenancePlans, meetingNotes } from "@/lib/db/schema";
import type { Currency } from "@/lib/domain/business";
import type { ClientProjectAccess } from "./access";

/**
 * Whitelisted portal views for maintenance and meeting notes. Internal notes and reviewer
 * identities stay on the team side.
 */

export interface ClientMaintenanceView {
  warrantyUntil: string | null;
  plans: {
    name: string;
    startDate: string;
    endDate: string;
    fee: number;
    currency: Currency;
    cycle: string;
    scope: string;
    excluded: string;
    responseHours: number | null;
    status: string;
  }[];
}

export async function clientMaintenance(
  access: ClientProjectAccess,
): Promise<ClientMaintenanceView> {
  const plans = await db
    .select({
      name: maintenancePlans.name,
      startDate: maintenancePlans.startDate,
      endDate: maintenancePlans.endDate,
      fee: maintenancePlans.fee,
      currency: maintenancePlans.currency,
      cycle: maintenancePlans.cycle,
      scope: maintenancePlans.scope,
      excluded: maintenancePlans.excluded,
      responseHours: maintenancePlans.responseHours,
      status: maintenancePlans.status,
    })
    .from(maintenancePlans)
    .where(
      and(
        eq(maintenancePlans.projectId, access.project.id),
        inArray(maintenancePlans.status, ["active", "ended"]),
      ),
    )
    .orderBy(asc(maintenancePlans.startDate));
  return { warrantyUntil: access.project.warrantyUntil, plans };
}

export interface ClientNoteView {
  id: string;
  title: string;
  meetingDate: string;
  attendees: string;
  body: string;
  side: "client" | "team";
  /** Review state, only for notes the client wrote. Team notes carry no internal state. */
  status: "pending_review" | "accepted" | "declined" | null;
  /** The team's reason, shown only when it declined a client note. */
  reviewNote: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

/**
 * Notes the client may see: everything they wrote, and team notes the team shared. Internal
 * notes, analysis results and reviewer identities never leave the team side.
 */
export async function clientNoteList(access: ClientProjectAccess): Promise<ClientNoteView[]> {
  const rows = await db
    .select({
      id: meetingNotes.id,
      title: meetingNotes.title,
      meetingDate: meetingNotes.meetingDate,
      attendees: meetingNotes.attendees,
      body: meetingNotes.body,
      side: meetingNotes.side,
      status: meetingNotes.status,
      reviewNote: meetingNotes.reviewNote,
      confirmedAt: meetingNotes.clientConfirmedAt,
      createdAt: meetingNotes.createdAt,
    })
    .from(meetingNotes)
    .where(
      and(
        eq(meetingNotes.projectId, access.project.id),
        or(
          eq(meetingNotes.side, "client"),
          and(eq(meetingNotes.side, "team"), eq(meetingNotes.visibility, "shared")),
        ),
      ),
    )
    .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    meetingDate: r.meetingDate,
    attendees: r.attendees,
    body: r.body,
    side: r.side,
    status:
      r.side !== "client"
        ? null
        : r.status === "pending_review"
          ? "pending_review"
          : r.status === "declined"
            ? "declined"
            : "accepted",
    reviewNote: r.side === "client" && r.status === "declined" ? r.reviewNote : null,
    confirmedAt: r.confirmedAt,
    createdAt: r.createdAt,
  }));
}
