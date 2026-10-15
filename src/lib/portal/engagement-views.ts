import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  changeRequests,
  clientApprovals,
  clientRequests,
  documents,
  maintenancePlans,
  meetingNotes,
} from "@/lib/db/schema";
import type {
  ApprovalStatus,
  ChangeRequestStatus,
  Currency,
  MaintenanceClass,
  RequestKind,
  RequestStatus,
} from "@/lib/domain/business";
import { listMessages, type MessageView } from "@/lib/engagement/messages";
import type { ClientProjectAccess } from "./access";

/**
 * Whitelisted portal views for requests, messages, approvals, change requests and maintenance.
 * Drafts and cancelled change requests, internal triage and suggestions stay internal.
 */

export interface ClientRequestView {
  id: string;
  kind: RequestKind;
  title: string;
  body: string;
  status: RequestStatus;
  /** Shown once the team has decided; never the automatic suggestion. */
  classification: MaintenanceClass | null;
  createdAt: Date;
}

export async function clientRequestList(access: ClientProjectAccess): Promise<ClientRequestView[]> {
  const rows = await db
    .select({
      id: clientRequests.id,
      kind: clientRequests.kind,
      title: clientRequests.title,
      body: clientRequests.body,
      status: clientRequests.status,
      classification: clientRequests.classification,
      createdAt: clientRequests.createdAt,
    })
    .from(clientRequests)
    .where(eq(clientRequests.projectId, access.project.id))
    .orderBy(desc(clientRequests.createdAt))
    .limit(100);
  return rows.map((r) => ({
    ...r,
    classification: r.classification === "unclassified" ? null : r.classification,
  }));
}

export async function clientMessageList(access: ClientProjectAccess): Promise<MessageView[]> {
  return listMessages(access.project.id);
}

export interface ClientApprovalView {
  id: string;
  title: string;
  description: string;
  status: ApprovalStatus;
  link: string | null;
  documentSlug: string | null;
  documentTitle: string | null;
  responseNote: string | null;
  createdAt: Date;
  respondedAt: Date | null;
}

export async function clientApprovalList(
  access: ClientProjectAccess,
): Promise<ClientApprovalView[]> {
  return db
    .select({
      id: clientApprovals.id,
      title: clientApprovals.title,
      description: clientApprovals.description,
      status: clientApprovals.status,
      link: clientApprovals.link,
      documentSlug: documents.slug,
      documentTitle: documents.title,
      responseNote: clientApprovals.responseNote,
      createdAt: clientApprovals.createdAt,
      respondedAt: clientApprovals.respondedAt,
    })
    .from(clientApprovals)
    .leftJoin(
      documents,
      and(eq(documents.id, clientApprovals.documentId), eq(documents.clientVisible, true)),
    )
    .where(
      and(
        eq(clientApprovals.projectId, access.project.id),
        inArray(clientApprovals.status, ["pending", "approved", "changes_requested"]),
      ),
    )
    .orderBy(desc(clientApprovals.createdAt));
}

export interface ClientChangeRequestView {
  id: string;
  number: number;
  title: string;
  description: string;
  impact: string;
  additionalCost: number;
  currency: Currency;
  additionalDays: number;
  status: ChangeRequestStatus;
  sentAt: Date | null;
  decidedAt: Date | null;
}

/** Only change requests the team has sent; drafts and cancelled ones are internal. */
export async function clientChangeRequestList(
  access: ClientProjectAccess,
): Promise<ClientChangeRequestView[]> {
  return db
    .select({
      id: changeRequests.id,
      number: changeRequests.number,
      title: changeRequests.title,
      description: changeRequests.description,
      impact: changeRequests.impact,
      additionalCost: changeRequests.additionalCost,
      currency: changeRequests.currency,
      additionalDays: changeRequests.additionalDays,
      status: changeRequests.status,
      sentAt: changeRequests.sentAt,
      decidedAt: changeRequests.decidedAt,
    })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.projectId, access.project.id),
        inArray(changeRequests.status, ["sent", "approved", "rejected", "done"]),
      ),
    )
    .orderBy(desc(changeRequests.number));
}

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
