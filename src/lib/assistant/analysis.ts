import type { Finding } from "./blocks";
import type { AssistantCopy } from "./copy/types";

/**
 * Deterministic project analysis. Every finding is derived from stored data and carries a
 * label saying how much it can be trusted; nothing here guesses.
 */

interface RequirementLike {
  title: string;
  status: string;
  source: string;
  group: string;
}

interface TaskLike {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
}

const INFERRED_MARKS = ["(inferred, confirm)", "(disimpulkan, konfirmasi)"];
const STALE_DAYS = 7;

export function analyzeRequirements(
  requirements: RequirementLike[],
  copy: AssistantCopy,
  href: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const r of requirements) {
    if (r.status === "conflicting")
      findings.push({
        label: "unknown",
        source: "requirements",
        text: copy.analysis.conflictingRequirement(r.title),
        href,
      });
    else if (r.status === "unknown")
      findings.push({
        label: "unknown",
        source: "requirements",
        text: copy.analysis.unknownRequirement(r.title),
        href,
      });
    else if (r.status === "inferred")
      findings.push({
        label: "inferred",
        source: "requirements",
        text: copy.analysis.inferredRequirement(r.title),
        href,
      });
  }
  return findings;
}

/** Splits markdown into `## ` sections. */
function sections(markdown: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  for (const part of markdown.split(/^## /m).slice(1)) {
    const [heading, ...rest] = part.split("\n");
    out.push({ heading: heading.trim(), body: rest.join("\n").trim() });
  }
  return out;
}

export function analyzePrd(
  prd: { content: string; status: string } | null | undefined,
  requirements: RequirementLike[],
  copy: AssistantCopy,
  hrefs: { prd: string; requirements: string },
): Finding[] {
  if (!prd)
    return [{ label: "unknown", source: "prd", text: copy.analysis.noPrd, href: hrefs.prd }];
  const findings: Finding[] = [];
  if (prd.status !== "approved")
    findings.push({
      label: "confirmed",
      source: "prd",
      text: copy.analysis.prdNotApproved,
      href: hrefs.prd,
    });
  for (const s of sections(prd.content)) {
    if (!s.body || /^(tbd|todo|-)$/i.test(s.body))
      findings.push({
        label: "unknown",
        source: "prd",
        text: copy.analysis.prdPlaceholder(s.heading),
        href: hrefs.prd,
      });
    else if (INFERRED_MARKS.some((m) => s.body.includes(m)))
      findings.push({
        label: "inferred",
        source: "prd",
        text: copy.analysis.prdPlaceholder(s.heading),
        href: hrefs.prd,
      });
  }
  // Generated requirements are in the PRD by construction; check only ones added later.
  const lower = prd.content.toLowerCase();
  for (const r of requirements) {
    if (r.source === "inferred" || r.source === "system" || r.source === "imported") continue;
    if (["overview", "open_questions", "assumptions"].includes(r.group)) continue;
    if (!lower.includes(r.title.toLowerCase()))
      findings.push({
        label: "confirmed",
        source: "prd",
        text: copy.analysis.prdMissing(r.title),
        href: hrefs.requirements,
      });
  }
  return findings;
}

export function analyzeTasks(
  tasks: TaskLike[],
  copy: AssistantCopy,
  taskHref: (id: string) => string,
  options: { onlyBlocked?: boolean; now?: Date } = {},
): Finding[] {
  const now = options.now ?? new Date();
  const findings: Finding[] = [];
  for (const t of tasks) {
    if (t.status === "blocked")
      findings.push({
        label: "confirmed",
        source: "tasks",
        text: copy.analysis.taskBlocked(t.title),
        href: taskHref(t.id),
      });
    if (options.onlyBlocked) continue;
    const days = Math.floor((now.getTime() - t.updatedAt.getTime()) / 86_400_000);
    if (t.status === "in_progress" && days >= STALE_DAYS)
      findings.push({
        label: "confirmed",
        source: "tasks",
        text: copy.analysis.taskStale(t.title, days),
        href: taskHref(t.id),
      });
    if (t.status === "review")
      findings.push({
        label: "confirmed",
        source: "tasks",
        text: copy.analysis.taskInReview(t.title),
        href: taskHref(t.id),
      });
  }
  return findings;
}

interface DecisionLike {
  number: number;
  question: string;
  selected: string;
  reason: string;
  context: string;
  options: string[];
}
interface RecommendationLike {
  key: string;
  value: { label: string; detail?: string };
  reason: string;
  source: string;
}
interface MemoryLike {
  title: string;
  content: string;
}

/**
 * "Why did we choose X?" Answers only from recorded decisions, recommendations and memory,
 * in that order of authority. Unknown is a valid answer.
 */
export function explainChoice(
  topic: string | undefined,
  data: {
    decisions: DecisionLike[];
    recommendations: RecommendationLike[];
    memories: MemoryLike[];
  },
  copy: AssistantCopy,
  hrefs: { decisions: string; plan: string; memory: string },
): Finding[] {
  const needle = (topic ?? "").toLowerCase().replace(/[?.!]/g, "").trim();
  const matches = (text: string) => needle.length >= 2 && text.toLowerCase().includes(needle);
  const findings: Finding[] = [];
  for (const d of data.decisions) {
    if (matches(`${d.question} ${d.selected} ${d.context} ${d.options.join(" ")}`))
      findings.push({
        label: "confirmed",
        source: "decision",
        text: copy.decision.found(d.number, d.question, d.selected, d.reason),
        href: hrefs.decisions,
      });
  }
  for (const r of data.recommendations) {
    if (matches(`${r.value.label} ${r.value.detail ?? ""} ${r.key}`))
      findings.push({
        label: r.source === "user" ? "confirmed" : "recommended",
        source: "recommendation",
        text: copy.decision.recommendation(r.key.replace("_", " "), r.value.label, r.reason),
        href: hrefs.plan,
      });
  }
  for (const m of data.memories) {
    if (matches(`${m.title} ${m.content}`))
      findings.push({
        label: "confirmed",
        source: "memory",
        text: copy.decision.memory(m.title, m.content),
        href: hrefs.memory,
      });
  }
  if (findings.length === 0)
    findings.push({ label: "unknown", text: copy.decision.unknown(topic || "this") });
  return findings.slice(0, 6);
}
