/**
 * A small Markdown reader for the PDF of a contract (pure). It understands what the contract
 * templates and the editor produce: headings, paragraphs, bullet and numbered lists, rules, block
 * quotes, tables (kept as rows of cells) and **bold** / *italic* inside text. Anything else is
 * read as plain text, never as markup that could do something.
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; inlines: Inline[] }
  | { type: "table"; rows: string[][] }
  | { type: "rule" };

/** **bold**, *italic*, __bold__, _italic_; links keep their text, code keeps its characters. */
export function parseInline(text: string): Inline[] {
  const clean = text
    .replace(/\[([^\]]+)\]\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/<[^>]*>/g, "");
  const out: Inline[] = [];
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g;
  let last = 0;
  for (let m = pattern.exec(clean); m; m = pattern.exec(clean)) {
    if (m.index > last) out.push({ text: clean.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ text: m[2], bold: true });
    else out.push({ text: m[4], italic: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) out.push({ text: clean.slice(last) });
  return out.filter((i) => i.text.length > 0);
}

const isRule = (line: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
const bullet = /^\s*[-*+]\s+(.*)$/;
const numbered = /^\s*\d+[.)]\s+(.*)$/;
const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line: string) =>
  /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0)
      blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({
        type: "heading",
        level,
        inlines: parseInline(heading[2].replace(/\s+#+\s*$/, "")),
      });
      continue;
    }
    if (isRule(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    if (isTableRow(line)) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && isTableRow(lines[i]); i++) {
        if (isTableDivider(lines[i])) continue;
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim()),
        );
      }
      i--;
      blocks.push({ type: "table", rows });
      continue;
    }
    if (bullet.test(line) || numbered.test(line)) {
      flush();
      const ordered = numbered.test(line);
      const items: Inline[][] = [];
      for (; i < lines.length; i++) {
        const m = (ordered ? numbered : bullet).exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[1]));
      }
      i--;
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      blocks.push({ type: "quote", inlines: parseInline(line.replace(/^>\s?/, "")) });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
