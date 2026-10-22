/**
 * Reads Markdown into what the wiki keeps: a title, a short summary, an outline, passages with
 * the lines they came from, and the links to other sources. Pure: no database, no network, and
 * no model. Nothing here is written by a model, so a page never says more than its source does.
 */

export interface WikiChunk {
  ordinal: number;
  heading: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface WikiLink {
  /** `refKey` of the target, resolved against the source it was written in. */
  targetRef: string;
  label: string;
}

export interface ParsedPage {
  title: string;
  summary: string;
  outline: string[];
  chunks: WikiChunk[];
  links: WikiLink[];
}

export const MAX_SOURCE_CHARS = 300_000;
export const MAX_CHUNKS = 500;
export const CHUNK_CHARS = 1200;
const SUMMARY_CHARS = 300;

/** Case, a leading "./" and the Markdown extension do not make a different target. */
export const refKey = (ref: string) =>
  ref
    .trim()
    .replace(/^\.\//, "")
    .replace(/\.(md|markdown)$/i, "")
    .toLowerCase();

/** Resolves `target` as written in a file at `from` ("docs/a/b.md" + "../c.md" is "docs/c"). */
export function resolveTarget(fromPath: string | null, target: string): string | null {
  const raw = target.split("#")[0].split("?")[0];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // "50%" is not valid percent-encoding; the link is still a link to that name.
  }
  const clean = decoded.trim();
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
  if (!fromPath || clean.startsWith("/")) return refKey(clean.replace(/^\/+/, ""));
  const parts = fromPath.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return refKey(parts.join("/"));
}

const HEADING_START = /^(#{1,6})[ \t]+/;
/** Longest line read. Longer ones are cut, so no pattern below can be made to run for long. */
const MAX_LINE = 2000;
const MAX_SEGMENT = 200;
const MAX_PATH = 500;

/** "## Title ##" to its level and text, with string operations only (no backtracking). */
function parseHeading(line: string): { level: number; text: string } | null {
  const start = HEADING_START.exec(line);
  if (!start) return null;
  let text = line.slice(start[0].length).trim();
  let i = text.length;
  while (i > 0 && text[i - 1] === "#") i--;
  // A closing run of # counts only after a space ("C#" keeps its #).
  if (i < text.length && (i === 0 || text[i - 1] === " " || text[i - 1] === "\t")) {
    text = text.slice(0, i).trimEnd();
  }
  return text ? { level: start[1].length, text } : null;
}
const FENCE = /^\s{0,3}(```|~~~)/;

interface Block {
  heading: string;
  start: number;
  end: number;
  lines: string[];
  prose: boolean;
}

const plain = (input: string) =>
  input
    .slice(0, MAX_LINE)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function parseMarkdown(
  raw: string,
  fallbackTitle: string,
  options: { fromPath?: string | null; maxChars?: number } = {},
): ParsedPage {
  const maxChars = options.maxChars ?? CHUNK_CHARS;
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => (l.length > MAX_LINE ? l.slice(0, MAX_LINE) : l));
  const stack: { level: number; text: string }[] = [];
  const outline: string[] = [];
  const blocks: Block[] = [];
  let title = "";
  let current: Block | null = null;
  let fenced = false;
  const inFence: boolean[] = [];

  const flush = () => {
    if (current && current.lines.some((l) => l.trim())) blocks.push(current);
    current = null;
  };
  const heading = () =>
    stack
      .map((h) => h.text)
      .join(" › ")
      .slice(0, MAX_PATH);

  lines.forEach((line, index) => {
    const number = index + 1;
    const fence = FENCE.test(line);
    if (fence) fenced = !fenced;
    inFence[index] = fenced || fence;
    const h = !fenced ? parseHeading(line) : null;
    if (h) {
      flush();
      const text = plain(h.text).slice(0, MAX_SEGMENT);
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      stack.push({ level: h.level, text });
      outline.push(`${"  ".repeat(h.level - 1)}${text}`);
      if (!title && h.level === 1) title = text;
      return;
    }
    if (!fenced && !line.trim()) {
      flush();
      return;
    }
    if (!current) {
      current = {
        heading: heading(),
        start: number,
        end: number,
        lines: [],
        prose: !fenced && !/^\s*([-*+]|\d+[.)]|\||```|~~~)/.test(line),
      };
    }
    (current as Block).lines.push(line);
    (current as Block).end = number;
  });
  flush();

  // Pack neighbouring blocks of one section into passages of a readable size.
  const chunks: WikiChunk[] = [];
  const pieces = (block: Block) => {
    const out: { start: number; end: number; text: string }[] = [];
    let buf: string[] = [];
    let start = block.start;
    let size = 0;
    block.lines.forEach((l, i) => {
      if (size + l.length > maxChars && buf.length) {
        out.push({ start, end: block.start + i - 1, text: buf.join("\n") });
        buf = [];
        start = block.start + i;
        size = 0;
      }
      buf.push(l.length > maxChars ? l.slice(0, maxChars) : l);
      size += l.length + 1;
    });
    if (buf.length) out.push({ start, end: block.end, text: buf.join("\n") });
    return out;
  };
  let open: WikiChunk | null = null;
  for (const block of blocks) {
    for (const piece of pieces(block)) {
      if (
        open &&
        open.heading === block.heading &&
        open.content.length + piece.text.length + 2 <= maxChars
      ) {
        open.content += `\n\n${piece.text}`;
        open.endLine = piece.end;
      } else {
        if (open) chunks.push(open);
        open = {
          ordinal: chunks.length,
          heading: block.heading,
          startLine: piece.start,
          endLine: piece.end,
          content: piece.text,
        };
      }
    }
  }
  if (open) chunks.push(open);

  const firstProse = blocks.find((b) => b.prose);
  const summary = plain(firstProse?.lines.join(" ") ?? "").slice(0, SUMMARY_CHARS);

  const seen = new Set<string>();
  const links: WikiLink[] = [];
  const add = (target: string | null, label: string) => {
    if (!target || seen.has(target)) return;
    seen.add(target);
    links.push({ targetRef: target, label: label.slice(0, 120) });
  };
  // Per line and with bounded patterns: a hostile line cannot make the reading slow.
  lines.forEach((line, i) => {
    if (inFence[i]) return;
    for (const m of line.matchAll(/(?<!!)\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/g)) {
      add(resolveTarget(options.fromPath ?? null, m[2]), plain(m[1]));
    }
    for (const m of line.matchAll(
      /\[\[([^\]|#]{1,200})(?:#[^\]|]{0,200})?(?:\|([^\]]{1,200}))?\]\]/g,
    )) {
      add(refKey(m[1]), (m[2] ?? m[1]).trim());
    }
  });

  return {
    title: title || fallbackTitle,
    summary,
    outline,
    chunks: chunks.slice(0, MAX_CHUNKS),
    links,
  };
}
