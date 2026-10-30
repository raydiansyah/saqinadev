import { afterEach, describe, expect, it, vi } from "vitest";
import { githubAdapter } from "@/lib/git/github";
import { gitlabAdapter } from "@/lib/git/gitlab";
import {
  countPatch,
  limitCompare,
  MAX_COMPARE_FILES,
  MAX_PATCH_CHARS,
  MAX_TOTAL_PATCH_CHARS,
} from "@/lib/git/types";

const ref = { fullName: "acme/shop", baseUrl: null };
const reply = (body: unknown, status = 200) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
afterEach(() => vi.unstubAllGlobals());

describe("GitHub compare", () => {
  it("maps the host's answer: files, status, counts, patches and commits", async () => {
    const fetchMock = reply({
      ahead_by: 2,
      commits: [
        { sha: "a".repeat(40), commit: { message: "Checkout API\n\nlong body" } },
        { sha: "b".repeat(40), commit: { message: "Checkout page" } },
      ],
      files: [
        {
          filename: "src/api/checkout.ts",
          status: "added",
          additions: 3,
          deletions: 0,
          patch: "@@ -0,0 +1,3 @@\n+a\n+b\n+c",
        },
        {
          filename: "src/old.ts",
          status: "removed",
          additions: 0,
          deletions: 2,
          patch: "@@ -1,2 +0,0 @@\n-x\n-y",
        },
        { filename: "img.png", status: "modified", additions: 0, deletions: 0 },
        {
          filename: "src/new-name.ts",
          status: "renamed",
          additions: 1,
          deletions: 1,
          patch: "@@\n-a\n+b",
        },
        { filename: "src/copy.ts", status: "copied", additions: 1, deletions: 0, patch: "@@\n+a" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await githubAdapter.compare?.(ref, "token", {
      base: "main",
      head: "saqina/exec-1234abcd",
    });
    expect(result?.aheadBy).toBe(2);
    expect(result?.commits).toEqual([
      { sha: "a".repeat(40), message: "Checkout API" },
      { sha: "b".repeat(40), message: "Checkout page" },
    ]);
    expect(
      result?.files.map((f) => [f.path, f.status, f.additions, f.deletions, f.patch === null]),
    ).toEqual([
      ["src/api/checkout.ts", "added", 3, 0, false],
      ["src/old.ts", "removed", 0, 2, false],
      ["img.png", "modified", 0, 0, true],
      ["src/new-name.ts", "renamed", 1, 1, false],
      ["src/copy.ts", "modified", 1, 0, false],
    ]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/repos/acme/shop/compare/main...saqina%2Fexec-1234abcd");
  });

  it("reports a missing branch as not_found, so the Studio can say there is nothing yet", async () => {
    vi.stubGlobal("fetch", reply({ message: "Not Found" }, 404));
    await expect(
      githubAdapter.compare?.(ref, "t", { base: "main", head: "nope" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("GitLab compare", () => {
  it("maps diffs to files and counts the changed lines itself", async () => {
    vi.stubGlobal(
      "fetch",
      reply({
        commits: [{ id: "c".repeat(40), title: "Add checkout" }],
        diffs: [
          {
            new_path: "a.ts",
            old_path: "a.ts",
            new_file: true,
            diff: "@@ -0,0 +1,2 @@\n+one\n+two\n",
          },
          { new_path: "b.ts", old_path: "b.ts", diff: "@@ -1,2 +1,1 @@\n-gone\n-also\n+kept\n" },
        ],
      }),
    );
    const result = await gitlabAdapter.compare?.({ fullName: "acme/shop", baseUrl: null }, "t", {
      base: "main",
      head: "x",
    });
    expect(result?.aheadBy).toBe(1);
    expect(result?.files.map((f) => [f.path, f.status, f.additions, f.deletions])).toEqual([
      ["a.ts", "added", 2, 0],
      ["b.ts", "modified", 1, 2],
    ]);
  });
});

describe("limits on what is returned", () => {
  const file = (patch: string | null) => ({
    path: "f",
    status: "modified" as const,
    additions: 1,
    deletions: 0,
    patch,
  });

  it("cuts a long patch and says so", () => {
    const out = limitCompare([file("x".repeat(MAX_PATCH_CHARS + 50))]);
    expect(out.truncated).toBe(true);
    expect(out.files[0].patch?.length).toBe(MAX_PATCH_CHARS);
  });

  it("keeps the total bounded and caps the number of files", () => {
    const many = Array.from({ length: MAX_COMPARE_FILES + 5 }, () =>
      file("y".repeat(MAX_PATCH_CHARS)),
    );
    const out = limitCompare(many);
    expect(out.files).toHaveLength(MAX_COMPARE_FILES);
    expect(out.truncated).toBe(true);
    expect(out.files.reduce((n, f) => n + (f.patch?.length ?? 0), 0)).toBeLessThanOrEqual(
      MAX_TOTAL_PATCH_CHARS,
    );
  });

  it("leaves a small change alone", () => {
    expect(limitCompare([file("+a"), file(null)])).toMatchObject({ truncated: false });
  });

  it("counts added and removed lines but not the diff headers", () => {
    expect(countPatch("--- a/x\n+++ b/x\n@@\n+a\n+b\n-c\n context")).toEqual({
      additions: 2,
      deletions: 1,
    });
  });
});
