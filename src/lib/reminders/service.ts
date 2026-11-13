import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, notExists } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { todayIso } from "@/lib/billing/rules";
import { db, type Tx } from "@/lib/db/client";
import {
  documentSignatures,
  documents,
  invoices,
  maintenancePlans,
  organizations,
  projects,
  reminderLog,
  reminderRules,
} from "@/lib/db/schema";
import { SIGNABLE_KINDS } from "@/lib/documents/reference";
import type { ReminderKind } from "@/lib/domain/business";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import {
  clientRecipients,
  deliver,
  notifyTx,
  type Pending,
  teamRecipients,
} from "@/lib/notifications/service";
import { requireOrg } from "@/lib/organizations/service";
import { parse } from "@/lib/validation";
import { DEFAULT_RULES, pickRule, type RuleLike, windowKey } from "./rules";

/**
 * Rules for an organization. Any default rule it does not have yet is created, so a new kind of
 * reminder reaches organizations that already have rules. Existing rules are never touched.
 */
export async function orgRules(organizationId: string, executor: Tx | typeof db = db) {
  const read = () =>
    executor
      .select()
      .from(reminderRules)
      .where(eq(reminderRules.organizationId, organizationId))
      .orderBy(asc(reminderRules.kind), asc(reminderRules.offsetDays));
  const rows = await read();
  const have = new Set(rows.map((r) => `${r.kind}:${r.offsetDays}`));
  const missing = DEFAULT_RULES.filter((r) => !have.has(`${r.kind}:${r.offsetDays}`));
  if (missing.length === 0) return rows;
  await executor
    .insert(reminderRules)
    .values(missing.map((r) => ({ ...r, organizationId })))
    .onConflictDoNothing();
  return read();
}

export async function setRuleEnabled(actor: Actor, input: unknown) {
  const { id, enabled } = parse(z.object({ id: z.uuid(), enabled: z.boolean() }), input);
  const { org } = await requireOrg(actor, "billing:write");
  const [row] = await db
    .update(reminderRules)
    .set({ enabled })
    .where(and(eq(reminderRules.id, id), eq(reminderRules.organizationId, org.id)))
    .returning({ id: reminderRules.id });
  if (!row) throw new AppError("NOT_FOUND");
}

/** Also send a rule's client reminders by WhatsApp, or stop doing so. */
export async function setRuleWhatsapp(actor: Actor, input: unknown) {
  const { id, whatsapp } = parse(z.object({ id: z.uuid(), whatsapp: z.boolean() }), input);
  const { org } = await requireOrg(actor, "billing:write");
  const [row] = await db
    .update(reminderRules)
    .set({ whatsapp })
    .where(and(eq(reminderRules.id, id), eq(reminderRules.organizationId, org.id)))
    .returning({ id: reminderRules.id });
  if (!row) throw new AppError("NOT_FOUND");
}

interface Candidate {
  kind: ReminderKind;
  projectId: string;
  projectSlug: string;
  projectName: string;
  entityType: string;
  entityId: string;
  anchor: string;
  params: Record<string, string>;
  /** Path under /project/<slug> (team) and /portal/projects/<slug> (client). */
  teamPath: string;
  clientPath: string;
}

const dateOf = (d: Date) => d.toISOString().slice(0, 10);

async function candidates(organizationId: string): Promise<Candidate[]> {
  const live = and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt));
  const [inv, unsigned, plans] = await Promise.all([
    db
      .select({ i: invoices, slug: projects.slug, name: projects.name })
      .from(invoices)
      .innerJoin(projects, eq(projects.id, invoices.projectId))
      .where(
        and(
          live,
          inArray(invoices.status, ["issued", "sent", "partially_paid"]),
          isNotNull(invoices.dueDate),
        ),
      ),
    db
      .select({ d: documents, slug: projects.slug, name: projects.name })
      .from(documents)
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(
        and(
          live,
          eq(documents.status, "approved"),
          eq(documents.clientVisible, true),
          inArray(documents.type, [...SIGNABLE_KINDS]),
          notExists(
            db
              .select({ id: documentSignatures.id })
              .from(documentSignatures)
              .where(
                and(
                  eq(documentSignatures.documentId, documents.id),
                  eq(documentSignatures.party, "client"),
                ),
              ),
          ),
        ),
      ),
    db
      .select({ m: maintenancePlans, slug: projects.slug, name: projects.name })
      .from(maintenancePlans)
      .innerJoin(projects, eq(projects.id, maintenancePlans.projectId))
      .where(and(live, eq(maintenancePlans.status, "active"))),
  ]);
  const base = (projectId: string, slug: string, name: string) => ({
    projectId,
    projectSlug: slug,
    projectName: name,
  });
  return [
    ...inv.flatMap(({ i, slug, name }) => {
      const params = {
        number: i.number ?? "",
        amount: formatMoney(i.total - i.amountPaid, i.currency),
        due: i.dueDate ?? "",
        project: name,
      };
      const shared = {
        ...base(i.projectId, slug, name),
        entityType: "invoice",
        entityId: i.id,
        anchor: i.dueDate as string,
        params,
        teamPath: "/billing",
        clientPath: `/invoices/${i.id}`,
      };
      return [
        { ...shared, kind: "invoice_due" as const },
        { ...shared, kind: "invoice_overdue" as const },
      ];
    }),
    ...unsigned.map(({ d, slug, name }) => ({
      ...base(d.projectId, slug, name),
      kind: "document_signature_pending" as const,
      entityType: "document",
      entityId: d.id,
      anchor: dateOf(d.updatedAt),
      params: { title: d.title, project: name },
      teamPath: `/documents/${d.slug}`,
      clientPath: `/documents/${d.slug}`,
    })),
    ...plans.map(({ m, slug, name }) => ({
      ...base(m.projectId, slug, name),
      kind: "maintenance_renewal" as const,
      entityType: "maintenance_plan",
      entityId: m.id,
      anchor: m.endDate,
      params: { name: m.name, end: m.endDate, project: name },
      teamPath: "/maintenance",
      clientPath: "/maintenance",
    })),
  ];
}

export interface RunSummary {
  organizations: number;
  sent: number;
  skipped: number;
}

/** One organization: pick the rule per candidate, claim the dedup slot, notify. */
async function runForOrg(organizationId: string, today: string): Promise<[number, number]> {
  const rules: RuleLike[] = await orgRules(organizationId);
  let sent = 0;
  let skipped = 0;
  const pendings: Pending[] = [];
  for (const c of await candidates(organizationId)) {
    const rule = pickRule(rules, c.kind, c.anchor, today);
    if (!rule) continue;
    const created = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(reminderLog)
        .values({
          ruleId: rule.id,
          projectId: c.projectId,
          entityType: c.entityType,
          entityId: c.entityId,
          windowKey: windowKey(c.anchor, rule.offsetDays),
        })
        .onConflictDoNothing()
        .returning({ id: reminderLog.id });
      if (!claimed) return null;
      const out: Pending[] = [];
      if (rule.audience !== "client")
        out.push(
          await notifyTx(tx, {
            userIds: await teamRecipients(tx, c.projectId),
            projectId: c.projectId,
            type: `reminder.${c.kind}`,
            params: c.params,
            href: `/project/${c.projectSlug}${c.teamPath}`,
            dedupKey: `reminder:${claimed.id}`,
            email: true,
          }),
        );
      if (rule.audience !== "team")
        out.push(
          await notifyTx(tx, {
            userIds: await clientRecipients(tx, c.projectId),
            projectId: c.projectId,
            type: `reminder.${c.kind}`,
            params: c.params,
            href: `/portal/projects/${c.projectSlug}${c.clientPath}`,
            dedupKey: `reminder:${claimed.id}`,
            email: true,
            whatsapp: rule.whatsapp,
          }),
        );
      const recipients = out.reduce((a, p) => a + p.ids.length, 0);
      await tx.update(reminderLog).set({ recipients }).where(eq(reminderLog.id, claimed.id));
      await recordActivity(tx, {
        projectId: c.projectId,
        actorId: null,
        type: "reminder.sent",
        entityType: c.entityType,
        entityId: c.entityId,
        metadata: { kind: c.kind, offset: rule.offsetDays, recipients },
      });
      return out;
    });
    if (created) {
      sent += 1;
      pendings.push(...created);
    } else skipped += 1;
  }
  await deliver(pendings);
  return [sent, skipped];
}

/** The cron entry point. Safe to run as often as needed: the log makes it idempotent. */
export async function runReminders(now = new Date()): Promise<RunSummary> {
  const today = todayIso(now);
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const summary: RunSummary = { organizations: orgs.length, sent: 0, skipped: 0 };
  for (const org of orgs) {
    const [sent, skipped] = await runForOrg(org.id, today);
    summary.sent += sent;
    summary.skipped += skipped;
  }
  return summary;
}

/** "Run now" from the reminders page, for the actor's organization only. */
export async function runRemindersForActor(actor: Actor) {
  const { org } = await requireOrg(actor, "billing:write");
  const [sent, skipped] = await runForOrg(org.id, todayIso());
  return { sent, skipped };
}

export async function recentReminderLog(actor: Actor, limit = 50) {
  const { org } = await requireOrg(actor, "billing:read");
  return db
    .select({
      id: reminderLog.id,
      kind: reminderRules.kind,
      offsetDays: reminderRules.offsetDays,
      entityType: reminderLog.entityType,
      recipients: reminderLog.recipients,
      createdAt: reminderLog.createdAt,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(reminderLog)
    .innerJoin(reminderRules, eq(reminderRules.id, reminderLog.ruleId))
    .leftJoin(projects, eq(projects.id, reminderLog.projectId))
    .where(eq(reminderRules.organizationId, org.id))
    .orderBy(desc(reminderLog.createdAt))
    .limit(limit);
}
