import { type DetectedStack, detectStack, MANIFESTS } from "@/lib/git/stack";
import type { FileEntry, GitAdapter, RepoInfo, RepoRef } from "@/lib/git/types";

/**
 * Reads the documents and manifests of an existing repository. Read-only and bounded: a handful
 * of text files, never the whole tree. Everything it returns is untrusted data.
 */

export interface RepoDoc {
  path: string;
  content: string;
  truncated: boolean;
}

export interface RepoSnapshot {
  info: RepoInfo;
  docs: RepoDoc[];
  stack: DetectedStack;
}

export const MAX_DOCS = 200;
export const MAX_DOC_CHARS = 100_000;

/** "owner/name", a github.com URL, or an .git clone URL to "owner/name". */
export function parseRepoInput(value: string): string | null {
  const text = value
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const url = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/.*)?$/i.exec(text);
  if (url) return `${url[1]}/${url[2]}`;
  return /^[\w.-]+\/[\w.-]+$/.test(text) ? text : null;
}

const TEXT_FILE = /(\.(md|mdx|markdown|txt|rst)|(^|\/)readme)$/i;

/** Lower number = read first. Specification-like files outrank the README. */
function priority(path: string, inDocs: boolean): number {
  const name = path.split("/").pop() ?? path;
  if (
    /^(prd|product[-_ ]?requirements?|spec|specs?|requirements?|brief)\.(md|mdx|txt)$/i.test(name)
  )
    return inDocs ? 1 : 0;
  if (/^readme(\.\w+)?$/i.test(name)) return inDocs ? 4 : 2;
  if (/^(agents|claude)\.md$/i.test(name)) return 3;
  // The plan and the task list become the project's own PLAN and tasks, so they must be read.
  if (
    /^((project|implementation|development|delivery)[-_ ]?)?(plan|roadmap)\.(md|mdx|txt)$/i.test(
      name,
    ) ||
    /^(tasks?|todo|to-do|backlog|checklist|task[-_ ]?list)\.(md|mdx|txt)$/i.test(name)
  )
    return inDocs ? 1 : 0;
  if (/^(architecture|design|overview)\.(md|mdx|txt)$/i.test(name)) return 5;
  return inDocs ? 6 : 7;
}

/**
 * Which files to read, in order, capped. Pure so it can be tested without a repository.
 * Everything in a documentation folder is read; at the top level, changelogs, licences and
 * contribution rules say nothing about what the product is and are left out.
 */
export function pickDocPaths(root: FileEntry[], docs: FileEntry[]): string[] {
  const candidates = [
    ...root
      .filter((f) => f.type === "file" && TEXT_FILE.test(f.path))
      .filter(
        (f) =>
          !/^(changelog|license|licence|contributing|code[-_]of[-_]conduct|security)/i.test(f.path),
      )
      .map((f) => ({ f, d: false })),
    ...docs.filter((f) => f.type === "file" && TEXT_FILE.test(f.path)).map((f) => ({ f, d: true })),
  ].filter(({ f }) => (f.size ?? 0) <= MAX_DOC_CHARS * 2);
  return candidates
    .map(({ f, d }) => ({ path: f.path, rank: priority(f.path, d) }))
    .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
    .slice(0, MAX_DOCS)
    .map((c) => c.path);
}

/** Folders whose documents describe the product. `docs` is always tried, the others when present. */
const DOC_DIRS =
  /^(docs?|documentation|specs?|design|planning|plans?|requirements|prd|tasks?|\.taskmaster)$/i;
const MAX_DEPTH = 6;
const MAX_LIST_CALLS = 80;
const MAX_LISTED = 800;

/**
 * Every file in the documentation folders, however deep, within bounds: a few levels, a few
 * dozen listings, a few hundred entries. Paths come back complete (`docs/api/overview.md`).
 */
export async function listDocTree(
  adapter: GitAdapter,
  ref: RepoRef,
  token: string | null,
  branch: string,
  root: FileEntry[],
  /** The folder the person named; `docs` when none. Always listed, whatever it is called. */
  docsPath = "docs",
): Promise<FileEntry[]> {
  const found = root
    .filter((f) => f.type === "dir" && DOC_DIRS.test(f.path.split("/").pop() ?? ""))
    .map((f) => f.path);
  let queue = [...new Set([docsPath, "docs", ...found])];
  const out: FileEntry[] = [];
  let calls = 0;
  for (let level = 0; level < MAX_DEPTH && queue.length > 0 && out.length < MAX_LISTED; level++) {
    const dirs = queue.slice(0, Math.max(0, MAX_LIST_CALLS - calls));
    calls += dirs.length;
    const lists = await Promise.all(
      dirs.map((dir) => adapter.listFiles(ref, token, { path: dir, ref: branch }).catch(() => [])),
    );
    const next: string[] = [];
    lists.forEach((entries, i) => {
      for (const entry of entries) {
        const path = entry.path.startsWith(`${dirs[i]}/`) ? entry.path : `${dirs[i]}/${entry.path}`;
        if (entry.type === "dir") next.push(path);
        else out.push({ ...entry, path });
      }
    });
    queue = next;
  }
  return out.slice(0, MAX_LISTED);
}

const READ_BATCH = 10;

export async function readRepository(
  adapter: GitAdapter,
  ref: RepoRef,
  token: string | null,
  options: { docsPath?: string } = {},
): Promise<RepoSnapshot> {
  const info = await adapter.getRepository(ref, token);
  const branch = info.defaultBranch;
  const root = await adapter.listFiles(ref, token, { ref: branch });
  const docs = await listDocTree(adapter, ref, token, branch, root, options.docsPath);

  const read = async (path: string) =>
    adapter.readFile(ref, token, { path, ref: branch }).catch(() => "");

  const paths = pickDocPaths(root, docs);
  // A few at a time: a documentation folder can hold a couple of hundred files.
  const contents: string[] = [];
  for (let i = 0; i < paths.length; i += READ_BATCH)
    contents.push(...(await Promise.all(paths.slice(i, i + READ_BATCH).map(read))));
  const found = paths
    .map((path, i) => ({ path, text: contents[i] ?? "" }))
    .filter((d) => d.text.trim().length > 0)
    .map((d) => ({
      path: d.path,
      content: d.text.slice(0, MAX_DOC_CHARS),
      truncated: d.text.length > MAX_DOC_CHARS,
    }));

  const present = MANIFESTS.filter((m) => root.some((f) => f.path === m));
  const manifests = Object.fromEntries(
    await Promise.all(present.map(async (m) => [m, await read(m)] as const)),
  );
  return { info, docs: found, stack: detectStack(manifests) };
}
