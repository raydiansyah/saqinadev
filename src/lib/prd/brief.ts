import * as z from "zod";

/** A PRD as a form: its title and one field per `##` section, in order. */
export interface PrdBrief {
  title: string;
  sections: { heading: string; body: string }[];
}

export const MAX_SECTIONS = 30;
export const MAX_SECTION_CHARS = 20_000;

export const prdBriefInput = z.object({
  title: z.string().trim().min(2).max(200),
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(1).max(120),
        body: z.string().max(MAX_SECTION_CHARS),
      }),
    )
    .min(1)
    .max(MAX_SECTIONS),
});

/** "## 3. Goals" and "## Goals" are the same heading. */
const cleanHeading = (h: string) => h.replace(/^\d+[.)]\s*/, "").trim();

/**
 * Splits markdown into the form: the first `#` line is the title, every `##` starts a field.
 * Text before the first `##` (a draft note, the intro) is kept as an "Overview" field only when
 * the document has no sections at all, so nothing typed is dropped.
 */
export function splitPrd(markdown: string, fallbackTitle: string): PrdBrief {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = fallbackTitle;
  const sections: PrdBrief["sections"] = [];
  const intro: string[] = [];
  let current: { heading: string; body: string[] } | null = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h1 = !inFence && /^#\s+(.+)$/.exec(line);
    const h2 = !inFence && /^##\s+(.+)$/.exec(line);
    if (h1 && !current && sections.length === 0 && title === fallbackTitle) {
      title = h1[1].trim();
    } else if (h2) {
      if (current)
        sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
      current = { heading: cleanHeading(h2[1]), body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
  if (sections.length === 0) sections.push({ heading: "Overview", body: intro.join("\n").trim() });
  return { title, sections: sections.slice(0, MAX_SECTIONS) };
}

/** The form back to markdown, sections numbered in order. Empty fields are left out. */
export function renderPrd(brief: PrdBrief): string {
  const body = brief.sections
    .filter((s) => s.body.trim().length > 0)
    .map((s, i) => `## ${i + 1}. ${cleanHeading(s.heading)}\n\n${s.body.trim()}`);
  return `# ${brief.title.trim()}\n\n${body.join("\n\n")}\n`;
}

/**
 * The rules-only Enhance, used when no model is set up: tidy spacing, turn loose lines into a
 * list, drop repeated lines. It never invents content.
 */
export function enhanceDeterministic(body: string): string {
  const seen = new Set<string>();
  const lines = body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => {
      const key = l.trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const plain = text.split("\n").filter((l) => l.trim());
  // Several short plain lines read better as a list.
  const listable =
    plain.length >= 2 &&
    plain.every((l) => !/^\s*([-*+]|\d+[.)]|#|\||>|```)/.test(l) && l.length <= 200);
  return listable ? plain.map((l) => `- ${l.trim()}`).join("\n") : text;
}
