/**
 * Tasks and milestones read from a repository's own task list or plan. Pure: no database, no
 * model. A task is a checkbox item (`- [ ]` or `- [x]`) anywhere, or, in a document that is
 * itself a task list, any list item. Headings above them become milestones.
 */

export interface ParsedTask {
  title: string;
  description: string;
  done: boolean;
}

export interface ParsedMilestone {
  title: string;
  tasks: ParsedTask[];
}

export const MAX_TASKS = 200;
export const MAX_MILESTONES = 30;
const TITLE_MAX = 160;
const DEFAULT_MILESTONE = "Imported tasks";

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*\S)\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** Headings that name the document or a whole list, not a stage of work. */
const GENERIC_HEADING =
  /^(tasks?|to-?do|backlog|checklist|task list|plan|project plan|roadmap|overview|notes|contents|table of contents)$/i;
/** Sections whose lists are not work to do. */
const IGNORED_SECTION =
  /\b(license|licence|credits|changelog|references?|links|resources|contributing|acknowledg\w*)\b/i;

const plain = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export function parseTasks(markdown: string, options: { plainItems: boolean }): ParsedMilestone[] {
  const milestones: ParsedMilestone[] = [];
  let current: ParsedMilestone | null = null;
  let last: ParsedTask | null = null;
  let lastIndent = 0;
  let total = 0;
  let fence = false;
  let ignored = false;

  const milestone = (title: string) => {
    const found = milestones.find((m) => m.title === title);
    if (found) return found;
    const next: ParsedMilestone = { title, tasks: [] };
    if (milestones.length < MAX_MILESTONES) milestones.push(next);
    return next;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    if (FENCE.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;

    const h = HEADING.exec(raw);
    if (h) {
      const text = plain(h[2]);
      last = null;
      ignored = IGNORED_SECTION.test(text);
      current =
        !ignored && text && !GENERIC_HEADING.test(text) ? milestone(clip(text, TITLE_MAX)) : null;
      continue;
    }
    if (ignored) continue;

    const m = ITEM.exec(raw);
    if (!m) {
      // A wrapped continuation line belongs to the item above.
      if (last && /^\s{2,}\S/.test(raw) && last.description.length < 600)
        last.description = `${last.description} ${plain(raw)}`.trim();
      continue;
    }
    const indent = m[1].replace(/\t/g, "    ").length;
    const isCheckbox = m[2] !== undefined;
    const text = plain(m[3]);
    if (text.length < 3) continue;
    // A plain item nested under a task is detail of that task, not another task.
    if (!isCheckbox && last && indent > lastIndent) {
      if (last.description.length < 600) last.description = `${last.description}; ${text}`.trim();
      continue;
    }
    if (!isCheckbox && !options.plainItems) continue;
    if (total >= MAX_TASKS) return milestones.filter((x) => x.tasks.length > 0);

    const target = current ?? milestone(DEFAULT_MILESTONE);
    const task: ParsedTask = {
      title: clip(text, TITLE_MAX),
      description: text.length > TITLE_MAX ? text : "",
      done: isCheckbox && m[2].toLowerCase() === "x",
    };
    target.tasks.push(task);
    total += 1;
    last = task;
    lastIndent = indent;
  }
  return milestones.filter((x) => x.tasks.length > 0);
}
