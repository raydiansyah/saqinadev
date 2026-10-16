import { sections } from "@/lib/assistant/analysis";
import type { PrdFindingKind } from "@/lib/db/schema";
import type { ScopeItemLike } from "@/lib/scope/check";
import { checkScope } from "@/lib/scope/check";

/**
 * Pure PRD check: compares the PRD text with the requirements, tasks and recorded scope and
 * lists the disagreements. It only reports what the stored data says; it never edits the PRD.
 */

export interface PrdCheckInput {
  /** Null when the project has no PRD yet. */
  prd: string | null;
  requirements: {
    id: string;
    title: string;
    group: string;
    status: string;
    source: string;
  }[];
  tasks: { id: string; title: string; status: string }[];
  scope: ScopeItemLike[];
}

export interface PrdCandidate {
  fingerprint: string;
  kind: PrdFindingKind;
  entityType: string | null;
  entityId: string | null;
  subject: string;
}

/** Groups that describe the project rather than list things to build. */
const NOT_BUILT = new Set(["overview", "open_questions", "assumptions"]);
/** Requirements the system wrote itself are in the PRD by construction. */
const SYSTEM_SOURCES = new Set(["inferred", "system", "imported"]);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export function checkPrd(input: PrdCheckInput): PrdCandidate[] {
  const out: PrdCandidate[] = [];
  if (input.prd === null) return out;

  for (const s of sections(input.prd)) {
    if (!s.body || /^(tbd|todo|-)$/i.test(s.body))
      out.push({
        fingerprint: `placeholder_section:${slug(s.heading)}`,
        kind: "placeholder_section",
        entityType: "document",
        entityId: "prd",
        subject: s.heading,
      });
  }

  const prdLower = input.prd.toLowerCase();
  for (const r of input.requirements) {
    if (NOT_BUILT.has(r.group) || SYSTEM_SOURCES.has(r.source) || r.status !== "confirmed")
      continue;
    if (!prdLower.includes(r.title.toLowerCase()))
      out.push({
        fingerprint: `requirement_not_in_prd:${r.id}`,
        kind: "requirement_not_in_prd",
        entityType: "requirement",
        entityId: r.id,
        subject: r.title,
      });
    if (checkScope(r.title, input.scope).status === "excluded")
      out.push({
        fingerprint: `requirement_out_of_scope:${r.id}`,
        kind: "requirement_out_of_scope",
        entityType: "requirement",
        entityId: r.id,
        subject: r.title,
      });
  }

  for (const t of input.tasks) {
    if (t.status === "done") continue;
    const verdict = checkScope(t.title, input.scope).status;
    if (verdict === "excluded" || verdict === "future")
      out.push({
        fingerprint: `task_out_of_scope:${t.id}`,
        kind: "task_out_of_scope",
        entityType: "task",
        entityId: t.id,
        subject: t.title,
      });
  }
  return out;
}
