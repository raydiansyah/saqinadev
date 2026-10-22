import { describe, expect, it, vi } from "vitest";
import type { FileEntry, GitAdapter } from "@/lib/git/types";
import { listDocTree } from "@/lib/imports/repo-reader";

/** A repository as a map of directory path to its entries. */
function adapter(tree: Record<string, FileEntry[]>, onList?: (path: string) => void): GitAdapter {
  const noop = async (): Promise<never> => {
    throw new Error("unused");
  };
  return {
    provider: "github",
    getRepository: noop,
    listFiles: async (_r: unknown, _t: unknown, input: { path?: string }) => {
      onList?.(input.path ?? "");
      const entries = tree[input.path ?? ""];
      if (!entries) throw new Error("not found");
      return entries;
    },
    readFile: noop,
    listBranches: noop,
    searchCode: noop,
    createBranch: noop,
    commitChanges: noop,
    createPullRequest: noop,
  } as unknown as GitAdapter;
}

const file = (path: string): FileEntry => ({ path, type: "file", size: 10 });
const dir = (path: string): FileEntry => ({ path, type: "dir" });
const ref = { fullName: "a/b", baseUrl: null };

describe("listDocTree", () => {
  it("finds files inside docs and its subfolders, with full paths", async () => {
    const out = await listDocTree(
      adapter({
        docs: [file("docs/a.md"), dir("docs/product")],
        "docs/product": [file("docs/product/prd.md"), dir("docs/product/old")],
        "docs/product/old": [file("docs/product/old/v0.md")],
      }),
      ref,
      null,
      "main",
      [dir("docs"), file("README.md")],
    );
    expect(out.map((f) => f.path).sort()).toEqual([
      "docs/a.md",
      "docs/product/old/v0.md",
      "docs/product/prd.md",
    ]);
  });

  it("completes relative entry paths", async () => {
    const out = await listDocTree(adapter({ docs: [file("a.md")] }), ref, null, "main", []);
    expect(out.map((f) => f.path)).toEqual(["docs/a.md"]);
  });

  it("also reads other documentation folders when the repository has them", async () => {
    const out = await listDocTree(
      adapter({ docs: [], specs: [file("specs/s.md")], src: [file("src/x.md")] }),
      ref,
      null,
      "main",
      [dir("specs"), dir("src")],
    );
    expect(out.map((f) => f.path)).toEqual(["specs/s.md"]);
  });

  it("lists the folder the person named, whatever it is called", async () => {
    const out = await listDocTree(
      adapter({ "handbook/team": [file("handbook/team/a.md")], docs: [] }),
      ref,
      null,
      "main",
      [],
      "handbook/team",
    );
    expect(out.map((f) => f.path)).toEqual(["handbook/team/a.md"]);
  });

  it("stops at six levels and ignores folders it cannot list", async () => {
    const calls: string[] = [];
    const out = await listDocTree(
      adapter(
        {
          docs: [dir("docs/l1")],
          "docs/l1": [dir("docs/l1/l2"), file("docs/l1/a.md")],
          "docs/l1/l2": [dir("docs/l1/l2/l3"), file("docs/l1/l2/b.md")],
          "docs/l1/l2/l3": [dir("docs/l1/l2/l3/l4"), file("docs/l1/l2/l3/c.md")],
          "docs/l1/l2/l3/l4": [dir("docs/l1/l2/l3/l4/l5"), file("docs/l1/l2/l3/l4/d.md")],
          "docs/l1/l2/l3/l4/l5": [dir("docs/l1/l2/l3/l4/l5/l6"), file("docs/l1/l2/l3/l4/l5/e.md")],
          "docs/l1/l2/l3/l4/l5/l6": [file("docs/l1/l2/l3/l4/l5/l6/f.md")],
        },
        (p) => calls.push(p),
      ),
      ref,
      null,
      "main",
      [],
    );
    expect(out.map((f) => f.path).sort()).toEqual([
      "docs/l1/a.md",
      "docs/l1/l2/b.md",
      "docs/l1/l2/l3/c.md",
      "docs/l1/l2/l3/l4/d.md",
      "docs/l1/l2/l3/l4/l5/e.md",
    ]);
    expect(calls).not.toContain("docs/l1/l2/l3/l4/l5/l6");
    // A missing docs folder is not an error.
    expect(await listDocTree(adapter({}), ref, null, "main", [])).toEqual([]);
  });

  it("bounds the number of listings", async () => {
    const onList = vi.fn();
    const many = Array.from({ length: 200 }, (_, i) => dir(`docs/d${i}`));
    const tree: Record<string, FileEntry[]> = { docs: many };
    for (const d of many) tree[d.path] = [file(`${d.path}/x.md`)];
    await listDocTree(adapter(tree, onList), ref, null, "main", []);
    expect(onList.mock.calls.length).toBeLessThanOrEqual(80);
  });
});
