import { gitFetch } from "./http";
import { type GitAdapter, GitError, MAX_FILE_BYTES, type RepoRef } from "./types";

const api = (ref: RepoRef) => (ref.baseUrl || "https://api.github.com").replace(/\/+$/, "");
const repo = (ref: RepoRef) =>
  `${api(ref)}/repos/${ref.fullName.split("/").map(encodeURIComponent).join("/")}`;
const headers = (token: string | null) => ({
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});
const path = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/** GitHub REST v3 through fetch. Multi-file commits use the Git data API (tree → commit → ref). */
export const githubAdapter: GitAdapter = {
  provider: "github",

  async getRepository(ref, token) {
    const r = await gitFetch<{ id: number; full_name: string; default_branch: string }>(repo(ref), {
      headers: headers(token),
    });
    const branch = await gitFetch<{ commit: { sha: string } }>(
      `${repo(ref)}/branches/${encodeURIComponent(r.default_branch)}`,
      {
        headers: headers(token),
      },
    ).catch(() => null);
    return {
      fullName: r.full_name,
      externalId: String(r.id),
      defaultBranch: r.default_branch,
      headSha: branch?.commit.sha ?? null,
    };
  },

  async listBranches(ref, token) {
    const rows = await gitFetch<{ name: string; commit: { sha: string } }[]>(
      `${repo(ref)}/branches?per_page=100`,
      {
        headers: headers(token),
      },
    );
    return rows.map((b) => ({ name: b.name, sha: b.commit.sha }));
  },

  async listFiles(ref, token, input) {
    const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
    const rows = await gitFetch<{ path: string; type: string; size: number }[] | { type: string }>(
      `${repo(ref)}/contents/${path(input.path ?? "")}${query}`,
      { headers: headers(token) },
    );
    if (!Array.isArray(rows)) return [];
    return rows.map((f) => ({
      path: f.path,
      type: f.type === "dir" ? "dir" : "file",
      size: f.size,
    }));
  },

  async readFile(ref, token, input) {
    const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
    const file = await gitFetch<{
      content?: string;
      encoding?: string;
      size: number;
      type: string;
    }>(`${repo(ref)}/contents/${path(input.path)}${query}`, { headers: headers(token) });
    if (file.type !== "file") throw new GitError("not_found");
    if (file.size > MAX_FILE_BYTES) throw new GitError("too_large");
    return Buffer.from(file.content ?? "", "base64").toString("utf8");
  },

  async searchCode(ref, token, query) {
    const q = encodeURIComponent(`${query} repo:${ref.fullName}`);
    const result = await gitFetch<{ items: { path: string }[] }>(
      `${api(ref)}/search/code?q=${q}&per_page=30`,
      {
        headers: headers(token),
      },
    );
    return result.items.map((i) => ({ path: i.path }));
  },

  async createBranch(ref, token, input) {
    const existing = await gitFetch<{ object: { sha: string } }>(
      `${repo(ref)}/git/ref/heads/${path(input.name)}`,
      {
        headers: headers(token),
      },
    ).catch((e) => (e instanceof GitError && e.code === "not_found" ? null : Promise.reject(e)));
    if (existing) return { name: input.name, sha: existing.object.sha };
    const base = await gitFetch<{ object: { sha: string } }>(
      `${repo(ref)}/git/ref/heads/${path(input.from)}`,
      {
        headers: headers(token),
      },
    );
    await gitFetch(`${repo(ref)}/git/refs`, {
      method: "POST",
      headers: { ...headers(token), "content-type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${input.name}`, sha: base.object.sha }),
    });
    return { name: input.name, sha: base.object.sha };
  },

  async commitChanges(ref, token, input) {
    const json = { ...headers(token), "content-type": "application/json" };
    const head = await gitFetch<{ object: { sha: string } }>(
      `${repo(ref)}/git/ref/heads/${path(input.branch)}`,
      {
        headers: headers(token),
      },
    );
    const parent = await gitFetch<{ tree: { sha: string } }>(
      `${repo(ref)}/git/commits/${head.object.sha}`,
      {
        headers: headers(token),
      },
    );
    const tree = await gitFetch<{ sha: string }>(`${repo(ref)}/git/trees`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: input.files.map((f) => ({
          path: f.path,
          mode: "100644",
          type: "blob",
          content: f.content,
        })),
      }),
    });
    const commit = await gitFetch<{ sha: string }>(`${repo(ref)}/git/commits`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [head.object.sha] }),
    });
    // Not a force update: fails if someone else moved the branch meanwhile.
    await gitFetch(`${repo(ref)}/git/refs/heads/${path(input.branch)}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return { sha: commit.sha };
  },

  async createPullRequest(ref, token, input) {
    try {
      const pr = await gitFetch<{ number: number; html_url: string }>(`${repo(ref)}/pulls`, {
        method: "POST",
        headers: { ...headers(token), "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      return { number: pr.number, url: pr.html_url };
    } catch (error) {
      // Already open for this branch: return that one instead of failing a retry.
      if (!(error instanceof GitError) || error.code !== "conflict") throw error;
      const owner = ref.fullName.split("/")[0];
      const [open] = await gitFetch<{ number: number; html_url: string }[]>(
        `${repo(ref)}/pulls?state=open&head=${encodeURIComponent(`${owner}:${input.head}`)}`,
        { headers: headers(token) },
      );
      if (!open) throw error;
      return { number: open.number, url: open.html_url };
    }
  },
};
