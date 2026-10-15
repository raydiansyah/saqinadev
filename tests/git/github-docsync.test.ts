import { afterEach, describe, expect, it } from "vitest";
import { githubAdapter } from "@/lib/git/github";
import { GitError } from "@/lib/git/types";

const ref = { fullName: "acme/shop", baseUrl: null };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
  return calls;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("github adapter: document sync operations", () => {
  it("lists files under a folder recursively and skips folders and other paths", async () => {
    const calls = fakeFetch(() =>
      json({
        truncated: false,
        tree: [
          { path: "docs", type: "tree" },
          { path: "docs/PRD.md", type: "blob", size: 10 },
          { path: "docs/api/overview.md", type: "blob", size: 20 },
          { path: "docsmith/readme.md", type: "blob", size: 5 },
          { path: "src/index.ts", type: "blob", size: 99 },
        ],
      }),
    );
    const tree = await githubAdapter.getTree(ref, "t", { ref: "main", path: "docs" });
    expect(tree).toEqual([
      { path: "docs/PRD.md", size: 10 },
      { path: "docs/api/overview.md", size: 20 },
    ]);
    expect(calls[0].url).toBe("https://api.github.com/repos/acme/shop/git/trees/main?recursive=1");
  });

  it("refuses a truncated tree rather than syncing part of the folder", async () => {
    fakeFetch(() => json({ truncated: true, tree: [] }));
    await expect(
      githubAdapter.getTree(ref, null, { ref: "main", path: "docs" }),
    ).rejects.toMatchObject({
      code: "too_large",
    });
  });

  it("finds the open pull request of a branch, or none", async () => {
    const calls = fakeFetch(() =>
      json([{ number: 7, html_url: "https://github.com/acme/shop/pull/7" }]),
    );
    const pr = await githubAdapter.findOpenPullRequest(ref, "t", {
      head: "saqina/docs-sync",
      base: "main",
    });
    expect(pr).toEqual({ number: 7, url: "https://github.com/acme/shop/pull/7" });
    expect(calls[0].url).toContain("head=acme%3Asaqina%2Fdocs-sync");
    expect(calls[0].url).toContain("base=main");
    fakeFetch(() => json([]));
    expect(
      await githubAdapter.findOpenPullRequest(ref, "t", { head: "x", base: "main" }),
    ).toBeNull();
  });

  it("updates a pull request's title and body", async () => {
    const calls = fakeFetch(() => json({}));
    await githubAdapter.updatePullRequest(ref, "t", { number: 7, title: "Docs", body: "Synced" });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(calls[0].url).toBe("https://api.github.com/repos/acme/shop/pulls/7");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ title: "Docs", body: "Synced" });
  });

  it("resets a branch with a force update of that one ref", async () => {
    const calls = fakeFetch(() => json({}));
    await githubAdapter.resetBranch(ref, "t", { name: "saqina/docs-sync", to: "abc123" });
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/acme/shop/git/refs/heads/saqina/docs-sync",
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ sha: "abc123", force: true });
  });

  it("tells a secondary rate limit apart from a bad token", async () => {
    fakeFetch(() => json({}, 403, { "retry-after": "30" }));
    await expect(githubAdapter.getRepository(ref, "t")).rejects.toMatchObject({
      code: "rate_limited",
    });
    fakeFetch(() => json({}, 403, { "x-ratelimit-remaining": "0" }));
    await expect(githubAdapter.getRepository(ref, "t")).rejects.toMatchObject({
      code: "rate_limited",
    });
    fakeFetch(() => json({}, 403));
    await expect(githubAdapter.getRepository(ref, "t")).rejects.toBeInstanceOf(GitError);
    await expect(githubAdapter.getRepository(ref, "t")).rejects.toMatchObject({
      code: "auth_failed",
    });
  });
});
