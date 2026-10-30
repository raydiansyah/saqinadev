import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type CompareFile,
  type GitAdapter,
  GitError,
  limitCompare,
  MAX_COMPARE_FILES,
  MAX_FILE_BYTES,
  MAX_PATCH_CHARS,
  type RepoRef,
} from "./types";

const run = promisify(execFile);

/** Development only: a repository on this machine, driven through the git CLI. */
export function localGitAllowed(env = process.env): boolean {
  return env.ALLOW_LOCAL_GIT === "1" && env.NODE_ENV !== "production";
}

async function git(
  ref: RepoRef,
  args: string[],
  options: { input?: string; env?: Record<string, string> } = {},
) {
  if (!localGitAllowed()) throw new GitError("unsupported");
  try {
    const child = run("git", ["-C", ref.fullName, ...args], {
      maxBuffer: 4 * MAX_FILE_BYTES,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
      timeout: 20_000,
    });
    if (options.input !== undefined) {
      child.child.stdin?.end(options.input);
    }
    return (await child).stdout;
  } catch (error) {
    const message = String((error as { stderr?: string }).stderr ?? error);
    if (/not a git repository|does not exist|cannot change to/i.test(message))
      throw new GitError("not_found");
    if (/invalid object|unknown revision|Not a valid object|does not exist in/i.test(message))
      throw new GitError("not_found");
    throw new GitError("provider_error");
  }
}

const safeName = (name: string) => {
  // Refuse anything git would read as an option or a weird ref.
  if (!/^[A-Za-z0-9._\-/]+$/.test(name) || name.startsWith("-") || name.includes(".."))
    throw new GitError("conflict");
  return name;
};
const safePath = (p: string) => {
  if (p.startsWith("/") || p.split("/").includes("..")) throw new GitError("conflict");
  return p;
};

/**
 * Commits go through plumbing (temporary index → write-tree → commit-tree → update-ref) so
 * the developer's working tree and current checkout are never touched.
 */
export const localGitAdapter: GitAdapter = {
  provider: "custom_local",

  async getRepository(ref) {
    const branch = (await git(ref, ["symbolic-ref", "--short", "HEAD"])).trim();
    const sha = (await git(ref, ["rev-parse", "HEAD"]).catch(() => "")).trim() || null;
    return { fullName: ref.fullName, externalId: null, defaultBranch: branch, headSha: sha };
  },

  async listBranches(ref) {
    const out = await git(ref, [
      "for-each-ref",
      "--format=%(refname:short) %(objectname)",
      "refs/heads",
    ]);
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, sha] = line.split(" ");
        return { name, sha };
      });
  },

  async listFiles(ref, _token, input) {
    const tree = `${safeName(input.ref ?? "HEAD")}:${input.path ? safePath(input.path) : ""}`;
    const out = await git(ref, ["ls-tree", "-l", tree]);
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [meta, name] = line.split("\t");
        const [, type, , size] = meta.split(/\s+/);
        return {
          path: input.path ? `${input.path}/${name}` : name,
          type: type === "tree" ? "dir" : "file",
          size: Number(size) || undefined,
        };
      });
  },

  async readFile(ref, _token, input) {
    const spec = `${safeName(input.ref ?? "HEAD")}:${safePath(input.path)}`;
    const size = Number((await git(ref, ["cat-file", "-s", spec])).trim());
    if (size > MAX_FILE_BYTES) throw new GitError("too_large");
    return git(ref, ["show", spec]);
  },

  async searchCode(ref, _token, query) {
    const out = await git(ref, ["grep", "-l", "-I", "--fixed-strings", "-e", query, "HEAD"]).catch(
      (e) => (e instanceof GitError ? "" : Promise.reject(e)),
    );
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(0, 30)
      .map((line) => ({ path: line.replace(/^HEAD:/, "") }));
  },

  async createBranch(ref, _token, input) {
    const name = safeName(input.name);
    const existing = (
      await git(ref, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]).catch(() => "")
    ).trim();
    if (existing) return { name, sha: existing };
    await git(ref, ["branch", name, safeName(input.from)]);
    return { name, sha: (await git(ref, ["rev-parse", name])).trim() };
  },

  async commitChanges(ref, _token, input) {
    const branch = safeName(input.branch);
    const parent = (await git(ref, ["rev-parse", `refs/heads/${branch}`])).trim();
    const dir = await mkdtemp(join(tmpdir(), "saqina-index-"));
    const env = { GIT_INDEX_FILE: join(dir, "index") };
    try {
      await git(ref, ["read-tree", parent], { env });
      for (const file of input.files) {
        const blob = (
          await git(ref, ["hash-object", "-w", "--stdin"], { input: file.content })
        ).trim();
        await git(
          ref,
          ["update-index", "--add", "--cacheinfo", `100644,${blob},${safePath(file.path)}`],
          { env },
        );
      }
      const tree = (await git(ref, ["write-tree"], { env })).trim();
      const commit = (
        await git(ref, ["commit-tree", tree, "-p", parent, "-m", input.message], {
          env: {
            GIT_AUTHOR_NAME: "Saqina",
            GIT_AUTHOR_EMAIL: "agent@saqina.local",
            GIT_COMMITTER_NAME: "Saqina",
            GIT_COMMITTER_EMAIL: "agent@saqina.local",
          },
        })
      ).trim();
      // Compare-and-swap: fails if the branch moved since we read it.
      await git(ref, ["update-ref", `refs/heads/${branch}`, commit, parent]);
      return { sha: commit };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },

  async compare(ref, _token, input) {
    const base = safeName(input.base);
    const head = safeName(input.head);
    const range = `${base}...${head}`;
    const numstat = (await git(ref, ["diff", "--numstat", "-M", range]))
      .trim()
      .split("\n")
      .filter(Boolean);
    const names = new Map<string, CompareFile["status"]>();
    for (const line of (await git(ref, ["diff", "--name-status", "-M", range]))
      .trim()
      .split("\n")
      .filter(Boolean)) {
      const [code, ...paths] = line.split("\t");
      names.set(
        paths[paths.length - 1],
        code.startsWith("A")
          ? "added"
          : code.startsWith("D")
            ? "removed"
            : code.startsWith("R")
              ? "renamed"
              : "modified",
      );
    }
    const files: CompareFile[] = [];
    for (const line of numstat.slice(0, MAX_COMPARE_FILES)) {
      const [add, del, ...rest] = line.split("\t");
      // A rename prints "old => new"; the path we keep is the new one.
      const raw = rest.join("\t");
      const path = raw.includes("=>") ? raw.replace(/^.*=> ?/, "").replace(/}$/, "") : raw;
      const binary = add === "-";
      const patch = binary
        ? null
        : (await git(ref, ["diff", range, "--", safePath(path)])).slice(0, MAX_PATCH_CHARS + 1);
      files.push({
        path,
        status: names.get(path) ?? "modified",
        additions: binary ? 0 : Number(add),
        deletions: binary ? 0 : Number(del),
        patch,
      });
    }
    const log = (await git(ref, ["log", "--format=%H%x09%s", `${base}..${head}`]))
      .trim()
      .split("\n")
      .filter(Boolean);
    const limited = limitCompare(files);
    return {
      aheadBy: log.length,
      files: limited.files,
      commits: log.map((l) => {
        const [sha, ...msg] = l.split("\t");
        return { sha, message: msg.join("\t").slice(0, 200) };
      }),
      truncated: limited.truncated || numstat.length > MAX_COMPARE_FILES,
    };
  },

  async createPullRequest() {
    // A local repository has no pull requests; the branch is there to review and merge by hand.
    throw new GitError("unsupported");
  },
};
