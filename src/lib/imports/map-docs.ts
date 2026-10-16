import type { RepoDoc } from "./repo-reader";

/**
 * Which of a repository's documents are the product's PRD, its plan, and its task list. Matching
 * is by file name only, so a README that happens to mention a plan is never taken for one. When
 * several files qualify, the one nearest the repository root wins (root before docs/ before the
 * rest), then the shortest name.
 */

const PRD =
  /^(prd|product[-_ ]?requirements?([-_ ]?document)?|spec(ification)?s?|requirements?|brief)\.(md|mdx|markdown|txt)$/i;
const PLAN =
  /^((project|implementation|development|delivery)[-_ ]?)?(plan|roadmap)\.(md|mdx|markdown|txt)$/i;
const TASKS = /^(tasks?|todo|to-do|backlog|checklist|task[-_ ]?list)\.(md|mdx|markdown|txt)$/i;

const base = (path: string) => path.split("/").pop() ?? path;
const depth = (path: string) => path.split("/").length;

function best(docs: RepoDoc[], pattern: RegExp): RepoDoc | null {
  return (
    docs
      .filter((d) => pattern.test(base(d.path)))
      .sort(
        (a, b) =>
          depth(a.path) - depth(b.path) ||
          base(a.path).length - base(b.path).length ||
          a.path.localeCompare(b.path),
      )[0] ?? null
  );
}

export interface MappedDocs {
  prd: RepoDoc | null;
  plan: RepoDoc | null;
  tasks: RepoDoc | null;
}

export function mapDocs(docs: RepoDoc[]): MappedDocs {
  const prd = best(docs, PRD);
  // A file cannot be two things: a document named like a PRD is not also the plan.
  const rest = docs.filter((d) => d !== prd);
  const plan = best(rest, PLAN);
  const tasks = best(
    rest.filter((d) => d !== plan),
    TASKS,
  );
  return { prd, plan, tasks };
}
