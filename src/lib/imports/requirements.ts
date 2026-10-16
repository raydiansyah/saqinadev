import type { RequirementGroup } from "@/lib/domain/enums";
import { scopeTokens } from "@/lib/scope/check";

/**
 * Requirements read straight from a repository's own documents. The generic requirements an
 * interview produces come from a fixed catalogue; they cannot know that this product has
 * "loyalty stamps" or "pre-orders close at 18:00". The documents do, so what they list as
 * features and rules becomes requirements here, marked imported and never confirmed.
 * Pure: no database, no model.
 */

export interface SourceDoc {
  /** Repository path, shown as the source of each requirement. */
  path: string;
  content: string;
}

export interface ExtractedRequirement {
  group: RequirementGroup;
  title: string;
  description: string;
}

/** Heading words that introduce a list of requirements, and the group each one belongs to. */
const SECTIONS: [RegExp, RequirementGroup][] = [
  [/\b(business|domain)\s+rules?\b|\brules?\b|aturan|ketentuan/i, "business_rules"],
  [/\b(user\s+)?(roles?|personas?|actors?|users)\b|peran|pengguna/i, "users_roles"],
  [/\b(integrations?|third[- ]party|external services?|integrasi)\b/i, "integrations"],
  [/\b(auth(entication|orization)?|login|sign[- ]?in|access control)\b/i, "authentication"],
  [/\b(data( model)?|entities|schema|database)\b/i, "data"],
  [/\b(ux|ui|design|user experience|screens?|pages?|tampilan)\b/i, "ux"],
  [
    /\b(constraints?|limitations?|non[- ]functional|performance|security|batasan)\b/i,
    "constraints",
  ],
  [/\b(assumptions?|asumsi)\b/i, "assumptions"],
  [/\b(open questions?|questions|todo|to-do|pertanyaan)\b/i, "open_questions"],
  [
    /\b(features?|functional|functionality|capabilit(y|ies)|requirements?|user stor(y|ies)|scope|what it does|fitur|kebutuhan|fungsi)\b/i,
    "features",
  ],
];

/** Sections that describe the repository, not the product. Their lists are never requirements. */
const IGNORED =
  /\b(install(ation)?|setup|set up|getting started|usage|run(ning)?|build|deploy(ment)?|contribut\w*|licen[sc]e|changelog|release|credits|acknowledg\w*|badges?|table of contents|contents|scripts?|commands?|environment|env|testing|tests?|prerequisites?|requirements? \(technical\)|tech(nical)? stack|stack|dependencies|folder structure|project structure|roadmap|support|faq|author|maintainers?)\b/i;

const MAX_TOTAL = 40;
const TITLE_MAX = 160;
const MIN_LENGTH = 8;

const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*\S)\s*$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

const plain = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

function groupFor(heading: string): RequirementGroup | null {
  for (const [re, group] of SECTIONS) if (re.test(heading)) return group;
  return null;
}

/** "Title: detail" bullets name the requirement before the colon; otherwise the whole line. */
function split(text: string): { title: string; detail: string } {
  const m = /^([^:.]{4,80}?)\s*[:–—-]\s+(.{8,})$/.exec(text);
  return m ? { title: m[1], detail: m[2] } : { title: text, detail: "" };
}

function extractFromDoc(doc: SourceDoc): ExtractedRequirement[] {
  type Found = ExtractedRequirement & { heading: string };
  const out: Found[] = [];
  let active: { group: RequirementGroup; heading: string } | null = null;
  let ignoredLevel: number | null = null;
  let last: Found | null = null;
  let lastIndent = 0;
  let fence = false;
  // A PRD is a requirements document even when its headings are unusual.
  const isPrd = /(^|\/)(prd|spec|requirements?)[^/]*$/i.test(doc.path);

  for (const raw of doc.content.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;

    const h = HEADING.exec(raw);
    if (h) {
      const level = h[1].length;
      const text = plain(h[2]);
      if (ignoredLevel !== null && level > ignoredLevel) continue; // inside an ignored section
      ignoredLevel = null;
      last = null;
      if (IGNORED.test(text) && !groupFor(text)) {
        ignoredLevel = level;
        active = null;
      } else {
        const group = groupFor(text);
        active = group
          ? { group, heading: text }
          : isPrd
            ? { group: "features", heading: text }
            : null;
      }
      continue;
    }
    if (!active || ignoredLevel !== null) continue;

    const b = BULLET.exec(raw);
    if (!b) {
      // A wrapped continuation line belongs to the bullet above.
      if (last && raw.trim() && /^\s{2,}\S/.test(raw) && last.description.length < 600)
        last.description = `${last.description} ${plain(raw)}`.trim();
      continue;
    }
    const indent = b[1].replace(/\t/g, "    ").length;
    const text = plain(b[2]);
    if (text.length < MIN_LENGTH || /^(https?:\/\/|\W+$)/.test(text)) continue;
    // A nested bullet adds detail to its parent instead of becoming a requirement of its own.
    if (last && indent > lastIndent) {
      if (last.description.length < 600) last.description = `${last.description}; ${text}`.trim();
      continue;
    }
    const { title, detail } = split(text);
    last = {
      heading: active.heading,
      group: active.group,
      title: clip(title, TITLE_MAX),
      description: `${detail || (title === text ? "" : text)}`.trim(),
    };
    lastIndent = indent;
    out.push(last);
  }

  return out.map(({ heading, ...rest }) => {
    const source = `Source: ${doc.path} › ${heading}`;
    return {
      ...rest,
      description: clip(rest.description ? `${rest.description}\n\n${source}` : source, 2000),
    };
  });
}

/** Two items name the same thing when most of the shorter one's words appear in the other. */
const stem = (t: string) => (t.length > 4 ? t.replace(/(es|s|e)$/, "") : t);

function similar(a: string, b: string): boolean {
  const ta = scopeTokens(a).map(stem);
  const tb = new Set(scopeTokens(b).map(stem));
  if (ta.length === 0 || tb.size === 0) return false;
  const hits = ta.filter((t) => tb.has(t)).length;
  return hits / Math.min(ta.length, tb.size) >= 0.8;
}

/**
 * What the documents list as requirements, without repeats and capped at a sensible number.
 * `existing` are titles already in the project; anything the documents merely repeat is skipped.
 */
export function extractRequirements(
  docs: SourceDoc[],
  existing: string[] = [],
): ExtractedRequirement[] {
  const out: ExtractedRequirement[] = [];
  for (const doc of docs) {
    for (const candidate of extractFromDoc(doc)) {
      if (out.length >= MAX_TOTAL) return out;
      if (out.some((o) => o.group === candidate.group && similar(o.title, candidate.title)))
        continue;
      if (existing.some((e) => similar(e, candidate.title))) continue;
      out.push(candidate);
    }
  }
  return out;
}
