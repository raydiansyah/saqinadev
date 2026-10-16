import type { RepoDoc } from "./repo-reader";

/**
 * Which of a repository's documents are the product's PRD, its plan, and its task list.
 * Three passes, each only filling roles the one before left empty:
 *   1. the file name (PRD.md, PLAN.md, TASKS.md and their usual variants),
 *   2. hints from a model that read the documents (paths, checked against what exists),
 *   3. what the text itself says: its title, its sections, its checkboxes.
 * A README is never taken for any of them. A file has one role. Among equals the file nearest
 * the repository root wins, so docs/old/prd.md never beats PRD.md.
 */

export type DocRole = "prd" | "plan" | "tasks";
export const DOC_ROLES: readonly DocRole[] = ["prd", "plan", "tasks"];

const PRD =
  /^(prd|product[-_ ]?requirements?([-_ ]?document)?|spec(ification)?s?|requirements?|brief)\.(md|mdx|markdown|txt)$/i;
const PLAN =
  /^((project|implementation|development|delivery)[-_ ]?)?(plan|roadmap)\.(md|mdx|markdown|txt)$/i;
const TASKS = /^(tasks?|todo|to-do|backlog|checklist|task[-_ ]?list)\.(md|mdx|markdown|txt)$/i;
const NAME: Record<DocRole, RegExp> = { prd: PRD, plan: PLAN, tasks: TASKS };

const base = (path: string) => path.split("/").pop() ?? path;
const depth = (path: string) => path.split("/").length;
const isReadme = (path: string) => /^readme(\.\w+)?$/i.test(base(path));

const nearest = (a: RepoDoc, b: RepoDoc) =>
  depth(a.path) - depth(b.path) ||
  base(a.path).length - base(b.path).length ||
  a.path.localeCompare(b.path);

const TITLE: Record<DocRole, RegExp> = {
  prd: /\b(prd|product requirements?|requirements? (document|specification)|product spec(ification)?|spesifikasi|kebutuhan produk)\b/i,
  plan: /\b(plan|roadmap|milestones?|rencana|implementation|delivery schedule)\b/i,
  tasks: /\b(tasks?|to-?do|backlog|checklist|task list|daftar tugas)\b/i,
};
const PRD_SECTIONS =
  /^#{1,3}\s+(goals?|non-goals?|objectives?|user stories|requirements?|features?|scope|success metrics|personas?|tujuan|fitur|kebutuhan)\b/gim;
const CHECKBOX = /^\s*[-*+]\s+\[[ xX]\]\s+\S/gm;

const firstHeading = (text: string) => /^#\s+(.+)$/m.exec(text)?.[1] ?? "";
const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

/** How strongly the text itself says it is this kind of document, 0 when it does not. */
function contentScore(doc: RepoDoc, role: DocRole): number {
  const title = firstHeading(doc.content);
  const titled = TITLE[role].test(title) ? 3 : 0;
  if (role === "prd") {
    const sections = count(doc.content, PRD_SECTIONS);
    // A PRD title plus a section or two, or four or more requirement-style sections on their own.
    return (titled > 0 && sections >= 1) || sections >= 4 ? titled + sections : 0;
  }
  const boxes = count(doc.content, CHECKBOX);
  if (role === "tasks") return (titled > 0 && boxes >= 2) || boxes >= 5 ? titled + boxes : 0;
  // A plan names phases or milestones in its title; checkboxes alone make it a task list.
  return titled > 0 && count(doc.content, /^#{2,3}\s+\S/gm) >= 2 ? titled : 0;
}

export interface MappedDocs {
  prd: RepoDoc | null;
  plan: RepoDoc | null;
  tasks: RepoDoc | null;
}

export function mapDocs(
  docs: RepoDoc[],
  /** Paths a model chose per role. Only paths of real documents are used. */
  hints: Partial<Record<DocRole, string>> = {},
): MappedDocs {
  const candidates = docs.filter((d) => !isReadme(d.path));
  const taken = new Set<RepoDoc>();
  const out: MappedDocs = { prd: null, plan: null, tasks: null };

  const assign = (role: DocRole, doc: RepoDoc | null | undefined) => {
    if (!doc || taken.has(doc) || out[role]) return;
    out[role] = doc;
    taken.add(doc);
  };

  // 1. names: the PRD first, so a file named like one is never also the plan.
  for (const role of DOC_ROLES)
    assign(
      role,
      candidates.filter((d) => !taken.has(d) && NAME[role].test(base(d.path))).sort(nearest)[0],
    );
  // 2. a model's hints.
  for (const role of DOC_ROLES)
    if (!out[role])
      assign(
        role,
        candidates.find((d) => d.path === hints[role] && !taken.has(d)),
      );
  // 3. the text itself.
  for (const role of DOC_ROLES) {
    if (out[role]) continue;
    const best = candidates
      .filter((d) => !taken.has(d))
      .map((d) => ({ d, score: contentScore(d, role) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || nearest(a.d, b.d))[0];
    assign(role, best?.d);
  }
  return out;
}
