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

export const MAX_DOCS = 10;
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
  if (/^(architecture|design|roadmap|plan|overview)\.(md|mdx|txt)$/i.test(name)) return 5;
  return inDocs ? 6 : 7;
}

/** Which files to read, in order, capped. Pure so it can be tested without a repository. */
export function pickDocPaths(root: FileEntry[], docs: FileEntry[]): string[] {
  const candidates = [
    ...root
      .filter((f) => f.type === "file" && TEXT_FILE.test(f.path))
      .map((f) => ({ f, d: false })),
    ...docs.filter((f) => f.type === "file" && TEXT_FILE.test(f.path)).map((f) => ({ f, d: true })),
  ]
    // Changelogs, licences and contribution rules say nothing about what the product is.
    .filter(
      ({ f }) =>
        !/(^|\/)(changelog|license|licence|contributing|code[-_]of[-_]conduct|security)/i.test(
          f.path,
        ),
    )
    .filter(({ f }) => (f.size ?? 0) <= MAX_DOC_CHARS * 2);
  return candidates
    .map(({ f, d }) => ({ path: f.path, rank: priority(f.path, d) }))
    .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
    .slice(0, MAX_DOCS)
    .map((c) => c.path);
}

export async function readRepository(
  adapter: GitAdapter,
  ref: RepoRef,
  token: string | null,
): Promise<RepoSnapshot> {
  const info = await adapter.getRepository(ref, token);
  const branch = info.defaultBranch;
  const [root, docs] = await Promise.all([
    adapter.listFiles(ref, token, { ref: branch }),
    adapter.listFiles(ref, token, { path: "docs", ref: branch }).catch(() => []),
  ]);

  const read = async (path: string) =>
    adapter.readFile(ref, token, { path, ref: branch }).catch(() => "");

  const paths = pickDocPaths(
    root,
    docs.map((f) => ({ ...f, path: f.path.startsWith("docs/") ? f.path : `docs/${f.path}` })),
  );
  const contents = await Promise.all(paths.map(read));
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
