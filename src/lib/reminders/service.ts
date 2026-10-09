import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { todayIso } from "@/lib/billing/rules";
import { db, type Tx } from "@/lib/db/client";
import {
  changeRequests,
  clientApprovals,
  invoices,
  maintenancePlans,
  organizations,
  projects,
  reminderLog,
  reminderRules,
} from "@/lib/db/schema";
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

/** Rules for an organization; the defaults are created the first time they are read. */
export async function orgRules(organizationId: string, executor: Tx | typeof db = db) {
  const rows = await executor
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.organizationId, organizationId))
    .orderBy(asc(reminderRules.kind), asc(reminderRules.offsetDays));
  if (rows.length > 0) return rows;
  await executor
    .insert(reminderRules)
    .values(DEFAULT_RULES.map((r) => ({ ...r, organizationId })))
    .onConflictDoNothing();
  return executor
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.organizationId, organizationId))
    .orderBy(asc(reminderRules.kind), asc(reminderRules.offsetDays));
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
  const [inv, approvals, crs, plans] = await Promise.all([
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
      .select({ a: clientApprovals, slug: projects.slug, name: projects.name })
      .from(clientApprovals)
      .innerJoin(projects, eq(projects.id, clientApprovals.projectId))
      .where(and(live, eq(clientApprovals.status, "pending"))),
    db
      .select({ c: changeRequests, slug: projects.slug, name: projects.name })
      .from(changeRequests)
      .innerJoin(projects, eq(projects.id, changeRequests.projectId))
      .where(and(live, eq(changeRequests.status, "sent"), isNotNull(changeRequests.sentAt))),
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
    ...approvals.map(({ a, slug, name }) => ({
      ...base(a.projectId, slug, name),
      kind: "approval_pending" as const,
      entityType: "client_approval",
      entityId: a.id,
      anchor: dateOf(a.createdAt),
      params: { title: a.title, project: name },
      teamPath: "/client-approvals",
      clientPath: "/approvals",
    })),
    ...crs.map(({ c, slug, name }) => ({
      ...base(c.projectId, slug, name),
      kind: "change_request_pending" as const,
      entityType: "change_request",
      entityId: c.id,
      anchor: dateOf(c.sentAt as Date),
      params: { number: `CR-${String(c.number).padStart(3, "0")}`, title: c.title, project: name },
      teamPath: "/changes",
      clientPath: "/changes",
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
