/**
 * A task's short reference: `T-` and the first eight characters of its id. It is what ties a
 * branch, a pull request or a commit back to the task, whether Saqina's agents or a developer's
 * own IDE agent made it. Branches look like `saqina/T-1a2b3c4d-checkout`; pull requests and
 * commits carry the same reference (the PR body line `Saqina-Task: T-1a2b3c4d` is the convention).
 */
export const taskRef = (taskId: string) =>
  `T-${taskId.replace(/-/g, "").slice(0, 8).toLowerCase()}`;

/** Every task reference in a text, lower-cased and without duplicates. */
export function findTaskRefs(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(/(?<![0-9A-Za-z])T-([0-9a-f]{8})(?![0-9A-Za-z])/gi))
      found.add(`T-${m[1].toLowerCase()}`);
  }
  return [...found];
}

/** The branch name an agent should use for a task: `<prefix>T-xxxxxxxx-<slug>`. */
export function branchFor(prefix: string, taskId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${prefix}${taskRef(taskId)}${slug ? `-${slug}` : ""}`;
}
