import { gitFetch } from "./http";
import { type GitAdapter, GitError, MAX_FILE_BYTES, type RepoRef } from "./types";

const api = (ref: RepoRef) => `${(ref.baseUrl || "https://gitlab.com").replace(/\/+$/, "")}/api/v4`;
const project = (ref: RepoRef) => `${api(ref)}/projects/${encodeURIComponent(ref.fullName)}`;
const headers = (token: string | null): Record<string, string> =>
  token ? { "private-token": token } : {};
const enc = encodeURIComponent;

/** GitLab REST v4. Merge requests stand in for pull requests. */
export const gitlabAdapter: GitAdapter = {
  provider: "gitlab",

  async getRepository(ref, token) {
    const p = await gitFetch<{ id: number; path_with_namespace: string; default_branch: string }>(
      project(ref),
      {
        headers: headers(token),
      },
    );
    const branch = await gitFetch<{ commit: { id: string } }>(
      `${project(ref)}/repository/branches/${enc(p.default_branch)}`,
      {
        headers: headers(token),
      },
    ).catch(() => null);
    return {
      fullName: p.path_with_namespace,
      externalId: String(p.id),
      defaultBranch: p.default_branch,
      headSha: branch?.commit.id ?? null,
    };
  },

  async listBranches(ref, token) {
    const rows = await gitFetch<{ name: string; commit: { id: string } }[]>(
      `${project(ref)}/repository/branches?per_page=100`,
      {
        headers: headers(token),
      },
    );
    return rows.map((b) => ({ name: b.name, sha: b.commit.id }));
  },

  async listFiles(ref, token, input) {
    const q = new URLSearchParams({ path: input.path ?? "", per_page: "100" });
    if (input.ref) q.set("ref", input.ref);
    const rows = await gitFetch<{ path: string; type: string }[]>(
      `${project(ref)}/repository/tree?${q}`,
      { headers: headers(token) },
    );
    return rows.map((f) => ({ path: f.path, type: f.type === "tree" ? "dir" : "file" }));
  },

  async readFile(ref, token, input) {
    const q = new URLSearchParams({ ref: input.ref ?? "HEAD" });
    const file = await gitFetch<{ content: string; size: number }>(
      `${project(ref)}/repository/files/${enc(input.path)}?${q}`,
      {
        headers: headers(token),
      },
    );
    if (file.size > MAX_FILE_BYTES) throw new GitError("too_large");
    return Buffer.from(file.content, "base64").toString("utf8");
  },

  async searchCode(ref, token, query) {
    const rows = await gitFetch<{ path: string }[]>(
      `${project(ref)}/search?scope=blobs&search=${enc(query)}`,
      {
        headers: headers(token),
      },
    );
    return rows.map((r) => ({ path: r.path }));
  },

  async createBranch(ref, token, input) {
    const existing = await gitFetch<{ name: string; commit: { id: string } }>(
      `${project(ref)}/repository/branches/${enc(input.name)}`,
      { headers: headers(token) },
    ).catch((e) => (e instanceof GitError && e.code === "not_found" ? null : Promise.reject(e)));
    if (existing) return { name: existing.name, sha: existing.commit.id };
    const b = await gitFetch<{ name: string; commit: { id: string } }>(
      `${project(ref)}/repository/branches?branch=${enc(input.name)}&ref=${enc(input.from)}`,
      { method: "POST", headers: headers(token) },
    );
    return { name: b.name, sha: b.commit.id };
  },

  async commitChanges(ref, token, input) {
    // GitLab needs create vs update per file.
    const actions = await Promise.all(
      input.files.map(async (f) => {
        const exists = await gitFetch(
          `${project(ref)}/repository/files/${enc(f.path)}?ref=${enc(input.branch)}`,
          {
            headers: headers(token),
          },
        )
          .then(() => true)
          .catch(() => false);
        return { action: exists ? "update" : "create", file_path: f.path, content: f.content };
      }),
    );
    const commit = await gitFetch<{ id: string }>(`${project(ref)}/repository/commits`, {
      method: "POST",
      headers: { ...headers(token), "content-type": "application/json" },
      body: JSON.stringify({ branch: input.branch, commit_message: input.message, actions }),
    });
    return { sha: commit.id };
  },

  async createPullRequest(ref, token, input) {
    try {
      const mr = await gitFetch<{ iid: number; web_url: string }>(
        `${project(ref)}/merge_requests`,
        {
          method: "POST",
          headers: { ...headers(token), "content-type": "application/json" },
          body: JSON.stringify({
            source_branch: input.head,
            target_branch: input.base,
            title: input.title,
            description: input.body,
          }),
        },
      );
      return { number: mr.iid, url: mr.web_url };
    } catch (error) {
      if (!(error instanceof GitError) || error.code !== "conflict") throw error;
      const [open] = await gitFetch<{ iid: number; web_url: string }[]>(
        `${project(ref)}/merge_requests?state=opened&source_branch=${enc(input.head)}`,
        { headers: headers(token) },
      );
      if (!open) throw error;
      return { number: open.iid, url: open.web_url };
    }
  },
};
