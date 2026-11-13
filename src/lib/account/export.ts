import "server-only";
import { desc, eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  documents,
  invoices,
  meetingNotes,
  organizationMembers,
  organizations,
  payments,
  projectMembers,
  projects,
  sessions,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/rate-limit";

/** Rows per section. An export is a copy for the person, not a database dump. */
const CAP = 2000;

export interface AccountExport {
  format: "saqina-account-export";
  version: 1;
  exportedAt: string;
  profile: {
    name: string;
    email: string;
    emailVerified: boolean;
    locale: string | null;
    platformRole: string;
    createdAt: string;
  };
  projects: { slug: string; name: string; role: string; since: string }[];
  organizations: { name: string; role: string; personal: boolean; since: string }[];
  authored: {
    invoices: { number: string | null; title: string; total: number; createdAt: string }[];
    payments: { amount: number; paidAt: string; method: string; createdAt: string }[];
    meetingNotes: { title: string; meetingDate: string; body: string; createdAt: string }[];
    documents: { slug: string; title: string; createdAt: string }[];
  };
  sessions: { device: string | null; createdAt: string; expiresAt: string }[];
  activity: { type: string; entityType: string; at: string }[];
  /** What is deliberately not in the file, so nobody mistakes the gap for a bug. */
  notIncluded: string[];
}

const iso = (d: Date) => d.toISOString();

/**
 * Everything personal Saqina holds about the signed-in person, as JSON they can keep (right of
 * access and portability). Secrets, session tokens and other people's data are never in it.
 */
export async function exportAccount(actor: Actor): Promise<AccountExport> {
  if (!(await allow(`account-export:${actor.id}`, 3, 60 * 60 * 1000)))
    throw new AppError("RATE_LIMIT");

  const [me] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!me) throw new AppError("NOT_FOUND");

  const [memberProjects, memberOrgs, bills, paid, notes, docs, sess, audit] = await Promise.all([
    db
      .select({
        slug: projects.slug,
        name: projects.name,
        role: projectMembers.role,
        since: projectMembers.createdAt,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, actor.id))
      .limit(CAP),
    db
      .select({
        name: organizations.name,
        role: organizationMembers.role,
        personal: organizations.personal,
        since: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, actor.id))
      .limit(CAP),
    db
      .select({
        number: invoices.number,
        title: invoices.title,
        total: invoices.total,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(eq(invoices.createdBy, actor.id))
      .orderBy(desc(invoices.createdAt))
      .limit(CAP),
    db
      .select({
        amount: payments.amount,
        paidAt: payments.paidAt,
        method: payments.method,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.recordedBy, actor.id))
      .orderBy(desc(payments.createdAt))
      .limit(CAP),
    db
      .select({
        title: meetingNotes.title,
        meetingDate: meetingNotes.meetingDate,
        body: meetingNotes.body,
        createdAt: meetingNotes.createdAt,
      })
      .from(meetingNotes)
      .where(eq(meetingNotes.authorId, actor.id))
      .orderBy(desc(meetingNotes.createdAt))
      .limit(CAP),
    db
      .select({ slug: documents.slug, title: documents.title, createdAt: documents.createdAt })
      .from(documents)
      .where(eq(documents.createdBy, actor.id))
      .orderBy(desc(documents.createdAt))
      .limit(CAP),
    db
      .select({
        device: sessions.userAgent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, actor.id))
      .orderBy(desc(sessions.createdAt))
      .limit(50),
    db
      .select({
        type: auditEvents.type,
        entityType: auditEvents.entityType,
        at: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(eq(auditEvents.actorId, actor.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(CAP),
  ]);

  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      actorId: actor.id,
      scope: "platform",
      type: "account.exported",
      entityType: "user",
      entityId: null,
      metadata: { rows: bills.length + paid.length + notes.length + docs.length },
    });
  });

  return {
    format: "saqina-account-export",
    version: 1,
    exportedAt: iso(new Date()),
    profile: {
      name: me.name,
      email: me.email,
      emailVerified: me.emailVerified,
      locale: me.locale,
      platformRole: me.platformRole,
      createdAt: iso(me.createdAt),
    },
    projects: memberProjects.map((p) => ({ ...p, since: iso(p.since) })),
    organizations: memberOrgs.map((o) => ({ ...o, since: iso(o.since) })),
    authored: {
      invoices: bills.map((i) => ({ ...i, createdAt: iso(i.createdAt) })),
      payments: paid.map((p) => ({ ...p, createdAt: iso(p.createdAt) })),
      meetingNotes: notes.map((n) => ({ ...n, createdAt: iso(n.createdAt) })),
      documents: docs.map((d) => ({ ...d, createdAt: iso(d.createdAt) })),
    },
    sessions: sess.map((s) => ({
      device: s.device,
      createdAt: iso(s.createdAt),
      expiresAt: iso(s.expiresAt),
    })),
    activity: audit.map((a) => ({ type: a.type, entityType: a.entityType, at: iso(a.at) })),
    notIncluded: [
      "Passwords and session tokens",
      "Other people's data, including the content of projects you only belong to",
      "The full text of documents and invoice lines (ask the project owner for a project export)",
    ],
  };
}
