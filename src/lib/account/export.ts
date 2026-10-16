import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/service";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  clientRequests,
  credentials,
  decisions,
  documents,
  meetingNotes,
  memories,
  organizationMembers,
  organizations,
  projectMembers,
  projectMessages,
  projects,
  serviceInquiries,
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
    workspaceMode: string;
    platformRole: string;
    createdAt: string;
  };
  projects: { slug: string; name: string; role: string; since: string }[];
  organizations: { name: string; role: string; personal: boolean; since: string }[];
  authored: {
    memories: { title: string; content: string; category: string; createdAt: string }[];
    meetingNotes: { title: string; meetingDate: string; body: string; createdAt: string }[];
    requests: { title: string; body: string; kind: string; createdAt: string }[];
    messages: { body: string; createdAt: string }[];
    decisions: { question: string; selected: string; createdAt: string }[];
    documents: { slug: string; title: string; createdAt: string }[];
  };
  inquiries: { message: string; status: string; consent: boolean; createdAt: string }[];
  connections: { provider: string; account: string; connectedAt: string }[];
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

  const [
    memberProjects,
    memberOrgs,
    memos,
    notes,
    requests,
    messages,
    decs,
    docs,
    inquiries,
    git,
    sess,
    audit,
  ] = await Promise.all([
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
        title: memories.title,
        content: memories.content,
        category: memories.category,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(eq(memories.createdBy, actor.id))
      .orderBy(desc(memories.createdAt))
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
      .select({
        title: clientRequests.title,
        body: clientRequests.body,
        kind: clientRequests.kind,
        createdAt: clientRequests.createdAt,
      })
      .from(clientRequests)
      .where(eq(clientRequests.authorId, actor.id))
      .orderBy(desc(clientRequests.createdAt))
      .limit(CAP),
    db
      .select({ body: projectMessages.body, createdAt: projectMessages.createdAt })
      .from(projectMessages)
      .where(eq(projectMessages.authorId, actor.id))
      .orderBy(desc(projectMessages.createdAt))
      .limit(CAP),
    db
      .select({
        question: decisions.question,
        selected: decisions.selected,
        createdAt: decisions.createdAt,
      })
      .from(decisions)
      .where(eq(decisions.createdBy, actor.id))
      .orderBy(desc(decisions.createdAt))
      .limit(CAP),
    db
      .select({ slug: documents.slug, title: documents.title, createdAt: documents.createdAt })
      .from(documents)
      .where(eq(documents.createdBy, actor.id))
      .orderBy(desc(documents.createdAt))
      .limit(CAP),
    db
      .select({
        message: serviceInquiries.message,
        status: serviceInquiries.status,
        consent: serviceInquiries.consent,
        createdAt: serviceInquiries.createdAt,
      })
      .from(serviceInquiries)
      .where(sql`lower(${serviceInquiries.email}) = ${me.email.toLowerCase()}`)
      .orderBy(desc(serviceInquiries.createdAt))
      .limit(CAP),
    // Only the label ("github:login"), never the sealed token.
    db
      .select({ label: credentials.label, createdAt: credentials.createdAt })
      .from(credentials)
      .where(sql`${credentials.userId} = ${actor.id} and ${credentials.revokedAt} is null`)
      .limit(50),
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
      metadata: { rows: memos.length + notes.length + requests.length + messages.length },
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
      workspaceMode: me.uiMode,
      platformRole: me.platformRole,
      createdAt: iso(me.createdAt),
    },
    projects: memberProjects.map((p) => ({ ...p, since: iso(p.since) })),
    organizations: memberOrgs.map((o) => ({ ...o, since: iso(o.since) })),
    authored: {
      memories: memos.map((m) => ({ ...m, createdAt: iso(m.createdAt) })),
      meetingNotes: notes.map((n) => ({ ...n, createdAt: iso(n.createdAt) })),
      requests: requests.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
      messages: messages.map((m) => ({ ...m, createdAt: iso(m.createdAt) })),
      decisions: decs.map((d) => ({ ...d, createdAt: iso(d.createdAt) })),
      documents: docs.map((d) => ({ ...d, createdAt: iso(d.createdAt) })),
    },
    inquiries: inquiries.map((i) => ({ ...i, createdAt: iso(i.createdAt) })),
    connections: git
      .filter((c) => c.label.includes(":"))
      .map((c) => ({
        provider: c.label.split(":")[0],
        account: c.label.split(":").slice(1).join(":"),
        connectedAt: iso(c.createdAt),
      })),
    sessions: sess.map((s) => ({
      device: s.device,
      createdAt: iso(s.createdAt),
      expiresAt: iso(s.expiresAt),
    })),
    activity: audit.map((a) => ({ type: a.type, entityType: a.entityType, at: iso(a.at) })),
    notIncluded: [
      "Passwords and session tokens",
      "Provider keys and access tokens (stored encrypted, never exported)",
      "Other people's data, including the content of projects you only belong to",
      "Project documents, requirements and tasks (ask the project owner for a project export)",
    ],
  };
}
