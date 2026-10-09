import type { Currency, ScopeCategory } from "@/lib/domain/business";
import { formatMoney } from "@/lib/money";
import { type BusinessDocCopy, businessDocEn, businessDocId } from "./business-copy";

/**
 * Business documents from project records (pure). Every fact comes from the input; anything
 * missing becomes a visible [PLACEHOLDER] instead of an invented value.
 */

export type BusinessDocKind = "proposal" | "agreement" | "handover" | "maintenance_agreement";

export const BUSINESS_DOC_SLUGS: Record<BusinessDocKind, string> = {
  proposal: "proposal",
  agreement: "agreement",
  handover: "handover",
  maintenance_agreement: "maintenance-agreement",
};

export interface BusinessDocInput {
  locale: "en" | "id";
  today: string;
  org: string;
  client: { name: string; company: string } | null;
  project: { name: string; description: string; objective: string | null };
  currency: Currency;
  value: number | null;
  scope: { title: string; description: string; category: ScopeCategory }[];
  terms: { label: string; amount: number; dueDate: string | null }[];
  milestones: { title: string; goal: string }[];
  warrantyUntil: string | null;
  plan: {
    name: string;
    startDate: string;
    endDate: string;
    fee: number;
    cycle: string;
    scope: string;
    excluded: string;
    responseHours: number | null;
  } | null;
}

const list = (items: string[], none: string) =>
  items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${none}`;

function header(c: BusinessDocCopy, kind: BusinessDocKind, d: BusinessDocInput): string[] {
  const client = d.client ? d.client.company || d.client.name : c.placeholder("CLIENT");
  return [
    `# ${c.titles[kind]}: ${d.project.name}`,
    "",
    c.draftNotice,
    "",
    c.preparedFor(client),
    c.preparedBy(d.org),
    c.date(d.today),
  ];
}

function scopeSection(c: BusinessDocCopy, d: BusinessDocInput, withFuture = true): string[] {
  const by = (cat: ScopeCategory) =>
    d.scope
      .filter((s) => s.category === cat)
      .map((s) => (s.description ? `${s.title}: ${s.description}` : s.title));
  const out = [
    `## ${c.h.scope}`,
    `### ${c.h.included}`,
    list(by("included"), c.none),
    `### ${c.h.excluded}`,
    list(by("excluded"), c.none),
  ];
  if (by("optional").length) out.push(`### ${c.h.optional}`, list(by("optional"), c.none));
  if (withFuture && by("future").length) out.push(`### ${c.h.future}`, list(by("future"), c.none));
  return out;
}

function money(c: BusinessDocCopy, d: BusinessDocInput): string[] {
  const fmt = (n: number) => formatMoney(n, d.currency, d.locale);
  return [
    `## ${c.h.pricing}`,
    d.value !== null ? fmt(d.value) : c.placeholder(c.unset.toUpperCase()),
    `## ${c.h.schedule}`,
    list(
      d.terms.map((t) => c.term(t.label, fmt(t.amount), t.dueDate)),
      c.unset,
    ),
  ];
}

function proposal(c: BusinessDocCopy, d: BusinessDocInput): string[] {
  return [
    ...header(c, "proposal", d),
    `## ${c.h.overview}`,
    d.project.description || c.placeholder("OVERVIEW"),
    `## ${c.h.objectives}`,
    d.project.objective || c.placeholder("OBJECTIVES"),
    ...scopeSection(c, d),
    `## ${c.h.timeline}`,
    list(
      d.milestones.map((m) => (m.goal ? `${m.title}: ${m.goal}` : m.title)),
      c.placeholder("TIMELINE"),
    ),
    ...money(c, d),
    `## ${c.h.assumptions}`,
    c.changeRequests,
    `## ${c.h.validity}`,
    c.validity,
  ];
}

function agreement(c: BusinessDocCopy, d: BusinessDocInput): string[] {
  const client = d.client ? `${d.client.company || d.client.name}` : c.placeholder("CLIENT");
  return [
    ...header(c, "agreement", d),
    `## ${c.h.parties}`,
    `1. ${d.org} ${c.placeholder("ADDRESS")}`,
    `2. ${client} ${c.placeholder("ADDRESS")}`,
    `## ${c.h.overview}`,
    d.project.description || c.placeholder("PROJECT DESCRIPTION"),
    ...scopeSection(c, d, false),
    `## ${c.h.timeline}`,
    list(
      d.milestones.map((m) => m.title),
      c.placeholder("TIMELINE"),
    ),
    ...money(c, d),
    `## ${c.h.revisions}`,
    c.revisions,
    `## ${c.h.changes}`,
    c.changeRequests,
    `## ${c.h.clientDuties}`,
    list(c.clientDuties, c.none),
    `## ${c.h.providerDuties}`,
    list(c.providerDuties, c.none),
    `## ${c.h.warranty}`,
    c.warranty(d.warrantyUntil),
    `## ${c.h.maintenance}`,
    c.maintenanceIntro,
    `## ${c.h.ip}`,
    c.ip,
    `## ${c.h.confidentiality}`,
    c.confidentiality,
    `## ${c.h.cancellation}`,
    c.cancellation,
    `## ${c.h.signatures}`,
    c.signatures,
  ];
}

function handover(c: BusinessDocCopy, d: BusinessDocInput): string[] {
  return [
    ...header(c, "handover", d),
    `## ${c.h.delivered}`,
    list(
      d.scope.filter((s) => s.category === "included").map((s) => s.title),
      c.none,
    ),
    `## ${c.h.checklist}`,
    c.handoverChecklist.map((i) => `- [ ] ${i}`).join("\n"),
    `## ${c.h.warranty}`,
    c.warranty(d.warrantyUntil),
    `## ${c.h.signatures}`,
    c.signatures,
  ];
}

function maintenance(c: BusinessDocCopy, d: BusinessDocInput): string[] {
  const p = d.plan;
  const fmt = (n: number) => formatMoney(n, d.currency, d.locale);
  return [
    ...header(c, "maintenance_agreement", d),
    c.maintenanceIntro,
    `## ${c.h.period}`,
    p ? `${p.startDate} - ${p.endDate}` : c.placeholder("PERIOD"),
    `## ${c.h.fee}`,
    p ? c.fee(fmt(p.fee), c.cycles[p.cycle] ?? p.cycle) : c.placeholder("FEE"),
    `## ${c.h.included}`,
    p?.scope || c.placeholder("INCLUDED SERVICES"),
    `## ${c.h.excluded}`,
    p?.excluded || c.placeholder("EXCLUDED SERVICES"),
    `## ${c.h.response}`,
    c.response(p?.responseHours ?? null),
    `## ${c.h.warranty}`,
    c.warranty(d.warrantyUntil),
    `## ${c.h.cancellation}`,
    c.cancellation,
    `## ${c.h.signatures}`,
    c.signatures,
  ];
}

const BUILDERS = { proposal, agreement, handover, maintenance_agreement: maintenance };

export function renderBusinessDoc(kind: BusinessDocKind, input: BusinessDocInput) {
  const c = input.locale === "id" ? businessDocId : businessDocEn;
  return {
    title: `${c.titles[kind]}: ${input.project.name}`,
    content: `${BUILDERS[kind](c, input).join("\n\n")}\n`,
  };
}
