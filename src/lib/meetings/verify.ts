import type { MeetingItemClass, MeetingMatchType } from "@/lib/domain/business";
import { checkScope, type ScopeItemLike, scopeTokens } from "@/lib/scope/check";

/** What the verifier knows about the project. Ids are the only ones a match may point at. */
export interface KnownEntities {
  requirements: { id: string; title: string }[];
  tasks: { id: string; title: string }[];
  decisions: { id: string; title: string }[];
  scope: ScopeItemLike[];
}

export interface RawItem {
  text: string;
  quote: string;
  classification: MeetingItemClass;
  matchedType?: MeetingMatchType | null;
  matchedId?: string | null;
  confidence: number;
  rationale: string;
}

export interface VerifiedItem {
  text: string;
  quote: string;
  classification: MeetingItemClass;
  matchedType: MeetingMatchType | null;
  matchedId: string | null;
  confidence: number;
  rationale: string;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
const cap = (item: VerifiedItem, max: number) => {
  item.confidence = Math.min(item.confidence, max);
};
const note = (item: VerifiedItem, text: string) => {
  item.rationale = item.rationale ? `${item.rationale} ${text}` : text;
};

/** Share of the smaller word set that the other contains. */
function overlap(a: string, b: string): number {
  const ta = scopeTokens(a);
  const tb = new Set(scopeTokens(b));
  if (ta.length === 0 || tb.size === 0) return 0;
  const hits = ta.filter((t) => tb.has(t)).length;
  return hits / Math.min(ta.length, tb.size);
}

const DUPLICATE_AT = 0.75;

function entityExists(type: MeetingMatchType, id: string, known: KnownEntities): boolean {
  const list =
    type === "requirement"
      ? known.requirements
      : type === "task"
        ? known.tasks
        : type === "decision"
          ? known.decisions
          : known.scope;
  return list.some((e) => e.id === id);
}

/**
 * Checks a model's items against what the project actually holds. The model proposes; this
 * decides what may stand: quotes must really be in the note, matches must point at records that
 * exist, and the recorded scope can overrule an item that claims to be in or out of scope.
 * Pure and deterministic, so it also protects against a confused or manipulated model.
 */
export function verifyItems(
  raw: RawItem[],
  noteBody: string,
  known: KnownEntities,
): VerifiedItem[] {
  const body = squash(noteBody);
  return raw.map((r) => {
    const item: VerifiedItem = {
      text: r.text.trim(),
      quote: r.quote.trim(),
      classification: r.classification,
      matchedType: r.matchedType ?? null,
      matchedId: r.matchedId ?? null,
      confidence: clamp(r.confidence),
      rationale: r.rationale.trim(),
    };

    // A quote that is not in the note was invented: drop it and trust the item less.
    if (item.quote && !body.includes(squash(item.quote))) {
      item.quote = "";
      cap(item, 40);
      note(item, "The quoted text was not found in the note.");
    }

    // A match must point at a real record of the stated kind.
    if (
      item.matchedId &&
      !(item.matchedType && entityExists(item.matchedType, item.matchedId, known))
    ) {
      item.matchedType = null;
      item.matchedId = null;
      cap(item, 40);
    }
    if (!item.matchedId) item.matchedType = null;

    // Revisions and duplicates only make sense against an existing record.
    if (
      (item.classification === "revision" || item.classification === "duplicate") &&
      !item.matchedId
    ) {
      item.classification = "unclear";
      cap(item, 40);
      note(item, "No matching record in the project was found.");
    }

    // A "new" item that is already in the plan is a duplicate, whatever the model said.
    if (item.classification === "new_in_scope") {
      const candidates = [
        ...known.requirements.map((e) => ({ ...e, type: "requirement" as const })),
        ...known.tasks.map((e) => ({ ...e, type: "task" as const })),
      ];
      const hit = candidates
        .map((c) => ({ c, score: overlap(item.text, c.title) }))
        .filter((x) => x.score >= DUPLICATE_AT)
        .sort((a, b) => b.score - a.score)[0];
      if (hit) {
        item.classification = "duplicate";
        item.matchedType = hit.c.type;
        item.matchedId = hit.c.id;
        note(item, "Already in the plan.");
      }
    }

    // The recorded scope outranks the model on scope questions.
    if (item.classification === "new_in_scope" || item.classification === "out_of_scope") {
      const verdict = checkScope(item.text, known.scope);
      if (verdict.status !== "unknown") {
        const outside = verdict.status === "excluded" || verdict.status === "future";
        if (item.classification === "new_in_scope" && outside) {
          item.classification = "conflict";
          item.matchedType = "scope_item";
          item.matchedId = verdict.item.id;
          cap(item, 50);
          note(item, `The agreed scope lists "${verdict.item.title}" as ${verdict.status}.`);
        } else if (item.classification === "out_of_scope" && verdict.status === "included") {
          item.classification = "conflict";
          item.matchedType = "scope_item";
          item.matchedId = verdict.item.id;
          cap(item, 50);
          note(item, `The agreed scope already includes "${verdict.item.title}".`);
        }
      }
    }

    if (!item.text) cap(item, 0);
    return item;
  });
}
