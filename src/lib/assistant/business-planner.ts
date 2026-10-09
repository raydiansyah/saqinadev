import type { ScopeCategory } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { checkScope } from "@/lib/scope/check";
import { parseBillingText } from "./billing-parse";
import type { Finding } from "./blocks";
import type { AssistantContext } from "./context-builder";
import type { AssistantCopy } from "./copy/types";
import type { IntentClassification } from "./intents/types";
import { act, exactAnswer, type PlanOutcome } from "./planner";

/**
 * Scope and billing answers. Every number comes from stored billing records and every scope
 * verdict from recorded scope items; these answers are marked exact so no model rewrites them.
 */

const exact = (draft: string, title: string, findings: Finding[]): PlanOutcome =>
  exactAnswer(draft, findings.length ? [{ type: "analysis", title, findings }] : []);

export function businessPlan(
  c: IntentClassification,
  ctx: AssistantContext,
  copy: AssistantCopy,
): PlanOutcome {
  const b = copy.business;
  const base = `/project/${ctx.access.project.slug}`;
  const currency = ctx.access.project.currency;
  const money = (n: number) => formatMoney(n, currency, b.locale);
  const e = c.entities;

  if (c.intent === "ASK_SCOPE" || c.intent === "ADD_SCOPE_ITEM") {
    const items = ctx.scope ?? [];
    if (c.intent === "ADD_SCOPE_ITEM") {
      if (!e.feature) return exactAnswer(b.scope.needsItem);
      const category: ScopeCategory = e.category ?? "included";
      return act(b.scope.addTitle(e.feature, b.scope.categories[category]), b.scope.describeAdd, [
        {
          type: "CREATE_SCOPE_ITEM",
          key: "s1",
          payload: { title: e.feature, description: "", category, clientVisible: true },
        },
      ]);
    }
    if (items.length === 0) return exactAnswer(b.scope.empty);
    const href = `${base}/features`;
    if (e.feature) {
      const v = checkScope(e.feature, items);
      const text = v.item
        ? b.scope.verdict[v.status as ScopeCategory](v.item.title)
        : b.scope.unknown(e.feature);
      return exact(text, b.scope.title, [
        { label: v.item ? "confirmed" : "unknown", source: "scope", text, href },
      ]);
    }
    return exact(
      b.scope.title,
      b.scope.title,
      items.slice(0, 30).map((i) => ({
        label: "confirmed" as const,
        source: "scope" as const,
        text: b.scope.line(b.scope.categories[i.category], i.title),
        href,
      })),
    );
  }

  const billing = ctx.billing;
  if (!billing || billing === "forbidden") return exactAnswer(b.billing.forbidden);
  const href = `${base}/billing`;

  if (c.intent === "ASK_BILLING") {
    const { totals, invoices, terms } = billing;
    if (totals.value === null && invoices.length === 0 && terms.length === 0)
      return exactAnswer(b.billing.empty);
    const f = (text: string): Finding => ({ label: "confirmed", source: "billing", text, href });
    const findings: Finding[] = [];
    if (totals.value !== null) findings.push(f(b.billing.value(money(totals.value))));
    findings.push(f(b.billing.invoiced(money(totals.invoiced))));
    findings.push(f(b.billing.paid(money(totals.paid))));
    findings.push(f(b.billing.outstanding(money(totals.outstanding))));
    if (totals.overdue > 0) findings.push(f(b.billing.overdue(money(totals.overdue))));
    if (totals.uninvoiced) findings.push(f(b.billing.uninvoiced(money(totals.uninvoiced))));
    for (const i of invoices.filter((x) => x.status !== "cancelled").slice(0, 8))
      findings.push(
        f(
          b.billing.invoiceLine({
            number: i.number ?? "draft",
            title: i.title,
            status: b.billing.statusNames[i.status] ?? i.status,
            balance: money(i.balance),
            due: i.dueDate ?? "",
          }),
        ),
      );
    for (const t of terms.filter((x) => !x.invoiceId).slice(0, 6))
      findings.push(f(b.billing.termLine(t.label, money(t.amount), false)));
    return exact(`${b.billing.summary} ${b.billing.paymentHint}`, b.billing.title, findings);
  }

  if (c.intent === "SETUP_BILLING") {
    if (billing.terms.some((t) => t.invoiceId)) return exactAnswer(b.setup.locked);
    const text = [e.title, e.description].filter(Boolean).join(" ");
    const parsed = parseBillingText(text, currency);
    const pending = { intent: c.intent, entities: { title: text.slice(0, 200) } };
    if (parsed.value === null)
      return {
        kind: "clarify",
        draft: b.setup.needsValue,
        options: [],
        pending: { ...pending, question: "billing" },
      };
    if (!parsed.terms)
      return {
        kind: "clarify",
        draft: b.setup.needsTerms,
        options: b.setup.termOptions,
        pending: { ...pending, question: "billing" },
      };
    const terms = parsed.terms.map((t, i) => ({
      label:
        t.kind === "dp"
          ? b.setup.dp
          : t.kind === "final" && i > 0
            ? b.setup.final
            : b.setup.installment(i + 1),
      percentBp: t.percentBp,
    }));
    return act(b.setup.title(money(parsed.value)), b.setup.describe, [
      {
        type: "SET_PAYMENT_SCHEDULE",
        key: "b1",
        payload: { value: parsed.value, terms },
        display: { currency },
      },
    ]);
  }

  // CREATE_INVOICE: only from the schedule, so the amount is never typed by the assistant.
  const open = billing.terms.filter((t) => !t.invoiceId);
  if (billing.terms.length === 0) return exactAnswer(b.invoice.noTerms);
  if (open.length === 0) return exactAnswer(b.invoice.allInvoiced);
  const topic = (e.topic ?? "").toLowerCase();
  const number = topic.match(/\d+/)?.[0];
  const term =
    (/\b(dp|down|uang muka|deposit)\b/.test(topic) &&
      open.find((t) => /^(dp|down)/i.test(t.label))) ||
    (/\b(final|pelunasan|terakhir|last)\b/.test(topic) && open.at(-1)) ||
    (number && open.find((t) => t.label.includes(number))) ||
    open[0];
  return act(b.invoice.title(term.label, money(term.amount)), b.invoice.describe, [
    {
      type: "CREATE_INVOICE",
      key: "i1",
      payload: { termId: term.id },
      display: { label: term.label, amount: term.amount, currency },
    },
  ]);
}

/** Before planning a new feature: is it explicitly outside the agreed scope? */
export function scopeConflict(
  feature: string,
  ctx: AssistantContext,
  copy: AssistantCopy,
): PlanOutcome | null {
  const v = checkScope(feature, ctx.scope ?? []);
  if (!v.item || v.status === "included") return null;
  const b = copy.business.scope;
  const text = b.conflict(feature, v.item.title, b.categories[v.status]);
  return exactAnswer(text, [
    {
      type: "analysis",
      title: b.title,
      findings: [
        {
          label: "confirmed",
          source: "scope",
          text: b.line(b.categories[v.status], v.item.title),
          href: `/project/${ctx.access.project.slug}/features`,
        },
      ],
    },
  ]);
}
