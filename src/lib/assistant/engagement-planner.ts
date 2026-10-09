import { todayIso } from "@/lib/billing/rules";
import { daysUntil } from "@/lib/maintenance/classify";
import { formatMoney } from "@/lib/money";
import { checkScope } from "@/lib/scope/check";
import type { Finding } from "./blocks";
import type { AssistantContext } from "./context-builder";
import type { AssistantCopy } from "./copy/types";
import { documentKindIn } from "./intents/rules";
import type { IntentClassification } from "./intents/types";
import { act, exactAnswer, type PlanOutcome } from "./planner";

/**
 * Change requests, business documents, maintenance answers and client reminders. Like the
 * billing planner, it only reads records and every write goes through a reviewed proposal.
 */

export function changeRequestPlan(feature: string, description: string, copy: AssistantCopy) {
  const c = copy.business.change;
  return act(c.title(feature), description || c.describe, [
    {
      type: "CREATE_CHANGE_REQUEST",
      key: "c1",
      payload: { title: feature, description: "", impact: "" },
    },
  ]);
}

/** A feature that the recorded scope excludes becomes a change request proposal, never a task. */
export function scopeConflict(
  feature: string,
  ctx: AssistantContext,
  copy: AssistantCopy,
): PlanOutcome | null {
  const v = checkScope(feature, ctx.scope ?? []);
  if (!v.item || v.status === "included") return null;
  const b = copy.business;
  return changeRequestPlan(
    feature,
    b.change.outOfScope(feature, v.item.title, b.scope.categories[v.status]),
    copy,
  );
}

export function engagementPlan(
  c: IntentClassification,
  ctx: AssistantContext,
  copy: AssistantCopy,
): PlanOutcome {
  const b = copy.business;
  const e = c.entities;
  const base = `/project/${ctx.access.project.slug}`;
  const currency = ctx.access.project.currency;
  const money = (n: number) => formatMoney(n, currency, b.locale);

  if (c.intent === "CREATE_CHANGE_REQUEST") {
    if (!e.feature) return exactAnswer(b.change.needsFeature);
    return changeRequestPlan(e.feature, "", copy);
  }

  if (c.intent === "GENERATE_DOCUMENT") {
    const kind = e.document ?? documentKindIn(e.description ?? "");
    if (!kind)
      return {
        kind: "clarify",
        draft: b.document.needsKind,
        options: b.document.options,
        pending: { intent: c.intent, entities: e, question: "document" },
      };
    const name = b.document.names[kind];
    return act(b.document.title(name), b.document.describe, [
      { type: "GENERATE_DOCUMENT", key: "d1", payload: { kind } },
    ]);
  }

  const eng = ctx.engagement;
  if (!eng) return exactAnswer(b.maintenance.none);
  const today = todayIso();

  if (c.intent === "ASK_MAINTENANCE") {
    const warranty = ctx.access.project.warrantyUntil;
    const f = (text: string): Finding => ({
      label: "confirmed",
      source: "maintenance",
      text,
      href: `${base}/maintenance`,
    });
    const findings: Finding[] = [];
    if (warranty) {
      const days = daysUntil(warranty, today);
      findings.push(
        f(
          days >= 0
            ? b.maintenance.warranty(warranty, days)
            : b.maintenance.warrantyEnded(warranty),
        ),
      );
    }
    for (const p of eng.plans.filter((x) => x.status !== "cancelled").slice(0, 4)) {
      const fee = formatMoney(p.fee, p.currency, b.locale);
      const days = daysUntil(p.endDate, today);
      const text =
        p.status === "active" && p.startDate > today
          ? b.maintenance.upcoming({ name: p.name, start: p.startDate, end: p.endDate, fee })
          : p.status === "active" && days >= 0
            ? b.maintenance.plan({ name: p.name, start: p.startDate, end: p.endDate, fee, days })
            : b.maintenance.ended(p.name, p.endDate);
      findings.push(f(text));
    }
    if (findings.length === 0) return exactAnswer(b.maintenance.none);
    if (!warranty) findings.push({ ...f(b.maintenance.noWarranty), label: "unknown" });
    return exactAnswer(b.maintenance.title, [
      { type: "analysis", title: b.maintenance.title, findings },
    ]);
  }

  // REMIND_CLIENT: about the oldest open item of the requested kind.
  if (eng.portalRecipients === 0) return exactAnswer(b.remind.noPortal);
  let target: {
    entityType: "invoice" | "client_approval" | "change_request";
    id: string;
    label: string;
  } | null = null;
  if (e.about === "approval") {
    const a = eng.approvals.find((x) => x.status === "pending");
    if (a) target = { entityType: "client_approval", id: a.id, label: b.remind.approval(a.title) };
  } else if (e.about === "change_request") {
    const cr = eng.changeRequests.find((x) => x.status === "sent");
    if (cr)
      target = {
        entityType: "change_request",
        id: cr.id,
        label: b.remind.changeRequest(`CR-${String(cr.number).padStart(3, "0")}`, cr.title),
      };
  } else if (ctx.billing && ctx.billing !== "forbidden") {
    const open = ctx.billing.invoices
      .filter((i) => ["issued", "sent", "partially_paid", "overdue"].includes(i.status))
      .sort((x, y) => (x.dueDate ?? "").localeCompare(y.dueDate ?? ""));
    const i = open[0];
    if (i)
      target = {
        entityType: "invoice",
        id: i.id,
        label: b.remind.invoice(i.number ?? "", money(i.balance)),
      };
  }
  if (!target) return exactAnswer(b.remind.nothingOpen);
  return act(b.remind.title(target.label), b.remind.describe(eng.portalRecipients), [
    {
      type: "SEND_CLIENT_REMINDER",
      key: "r1",
      payload: { entityType: target.entityType, entityId: target.id },
      display: { label: target.label, recipients: eng.portalRecipients },
    },
  ]);
}
