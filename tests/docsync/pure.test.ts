import { describe, expect, it } from "vitest";
import { decide } from "@/lib/docsync/decide";
import { hashContent, normalizeContent } from "@/lib/docsync/hash";
import {
  cleanDocsPath,
  docSlug,
  isSyncType,
  parseProvenance,
  pathForDocument,
  stripProvenance,
  syncableFiles,
} from "@/lib/docsync/paths";

describe("content hashing", () => {
  it("ignores line endings, trailing spaces and final newlines", () => {
    const a = "# Title  \r\n\r\nBody text\t\r\n\r\n\r\n";
    const b = "# Title\n\nBody text\n";
    expect(normalizeContent(a)).toBe(b);
    expect(hashContent(a)).toBe(hashContent(b));
  });
  it("still sees real changes", () => {
    expect(hashContent("one\n")).not.toBe(hashContent("two\n"));
    expect(hashContent("a\n\nb\n")).not.toBe(hashContent("a\nb\n"));
  });
});

describe("repository paths", () => {
  it("syncs only PRD, PLAN and custom documents, never business documents", () => {
    for (const type of ["prd", "plan", "custom"] as const) expect(isSyncType(type)).toBe(true);
    for (const type of [
      "proposal",
      "agreement",
      "handover",
      "maintenance_agreement",
      "memory",
    ] as const)
      expect(isSyncType(type)).toBe(false);
    expect(pathForDocument({ slug: "agreement", type: "agreement" }, "docs")).toBeNull();
  });
  it("places documents in the docs folder", () => {
    expect(pathForDocument({ slug: "prd", type: "prd" }, "docs")).toBe("docs/PRD.md");
    expect(pathForDocument({ slug: "plan", type: "plan" }, "docs")).toBe("docs/PLAN.md");
    expect(pathForDocument({ slug: "runbook", type: "custom" }, "docs/saqina")).toBe(
      "docs/saqina/runbook.md",
    );
  });
  it("accepts only safe folder names", () => {
    expect(cleanDocsPath(" /docs/ ")).toBe("docs");
    expect(cleanDocsPath("docs/saqina")).toBe("docs/saqina");
    for (const bad of [
      "",
      "   ",
      "../etc",
      "docs/../x",
      "/",
      "a b",
      "docs//x",
      "x".repeat(101),
      "docs/.",
      "..",
    ])
      expect(cleanDocsPath(bad), bad).toBeNull();
    expect(cleanDocsPath(null)).toBeNull();
  });
  it("reads and strips the import header so it never travels back to the repository", () => {
    const body = "# Title\n\nText\n";
    const doc = `> Imported from https://github.com/acme/shop/blob/main/docs/api/overview.md\n\n${body}`;
    expect(parseProvenance(doc)).toEqual({
      repo: "acme/shop",
      branch: "main",
      path: "docs/api/overview.md",
      truncated: false,
    });
    expect(stripProvenance(doc)).toBe(body);
    const cut = `> Imported from https://github.com/acme/shop/blob/main/README.md (truncated)\n\n${body}`;
    expect(parseProvenance(cut)?.truncated).toBe(true);
    expect(stripProvenance(cut)).toBe(body);
    expect(parseProvenance(body)).toBeNull();
    expect(stripProvenance(body)).toBe(body);
  });
  it("builds unique slugs that never collide with the generated PRD and PLAN", () => {
    const taken = new Set<string>();
    expect(docSlug("docs/PRD.md", taken)).toBe("repo-docs-prd");
    expect(docSlug("docs/prd.md", taken)).toBe("repo-docs-prd-2");
    expect(docSlug("PLAN.md", taken)).toBe("repo-plan");
  });
  it("picks markdown files only, capped and ordered", () => {
    const files = syncableFiles([
      { path: "docs/b.md", size: 10 },
      { path: "docs/a.mdx", size: 10 },
      { path: "docs/logo.png", size: 10 },
      { path: "docs/huge.md", size: 5_000_000 },
    ]);
    expect(files.map((f) => f.path)).toEqual(["docs/a.mdx", "docs/b.md"]);
    const many = Array.from({ length: 80 }, (_, i) => ({
      path: `docs/n${String(i).padStart(2, "0")}.md`,
      size: 1,
    }));
    expect(syncableFiles(many)).toHaveLength(50);
  });
});

const H = { a: "hash-a", b: "hash-b", c: "hash-c" };

describe("three-way decision", () => {
  it("does nothing when neither side moved", () => {
    expect(decide({ local: H.a, remote: H.a, remoteSeen: H.a, pushed: null }).action).toBe("none");
  });
  it("pushes a Saqina change and pulls a repository change", () => {
    expect(decide({ local: H.b, remote: H.a, remoteSeen: H.a, pushed: null }).action).toBe("push");
    expect(decide({ local: H.a, remote: H.b, remoteSeen: H.a, pushed: null }).action).toBe("pull");
  });
  it("never turns its own push into a remote change while the pull request is open", () => {
    // Pushed b to the sync branch; the base branch still has a.
    const open = decide({ local: H.b, remote: H.a, remoteSeen: H.a, pushed: H.b });
    expect(open).toEqual({ action: "none", merged: false });
  });
  it("recognises the merged pull request and does not pull it back", () => {
    const merged = decide({ local: H.b, remote: H.b, remoteSeen: H.a, pushed: H.b });
    expect(merged).toEqual({ action: "none", merged: true });
  });
  it("pushes a newer Saqina edit made after the merge", () => {
    expect(decide({ local: H.c, remote: H.b, remoteSeen: H.a, pushed: H.b })).toEqual({
      action: "push",
      merged: true,
    });
  });
  it("pushes again when Saqina changed while a pull request is open", () => {
    expect(decide({ local: H.c, remote: H.a, remoteSeen: H.a, pushed: H.b }).action).toBe("push");
  });
  it("keeps both sides when each changed differently, and adopts identical changes", () => {
    expect(decide({ local: H.b, remote: H.c, remoteSeen: H.a, pushed: null }).action).toBe(
      "conflict",
    );
    expect(decide({ local: H.b, remote: H.b, remoteSeen: H.a, pushed: null }).action).toBe("adopt");
  });
  it("flags a repository edit made while Saqina's own change was still pending", () => {
    expect(decide({ local: H.b, remote: H.c, remoteSeen: H.a, pushed: H.b }).action).toBe(
      "conflict",
    );
  });
  it("handles the first sight of a document", () => {
    // New in Saqina, no file yet: push.
    expect(decide({ local: H.a, remote: null, remoteSeen: null, pushed: null }).action).toBe(
      "push",
    );
    // Same text on both sides when first linked (an imported document): adopt, no conflict.
    expect(decide({ local: H.a, remote: H.a, remoteSeen: null, pushed: null }).action).toBe(
      "adopt",
    );
    // Different text when first linked: conflict, never an overwrite.
    expect(decide({ local: H.a, remote: H.b, remoteSeen: null, pushed: null }).action).toBe(
      "conflict",
    );
  });
  it("keeps the document when the repository file disappears", () => {
    expect(decide({ local: H.a, remote: null, remoteSeen: H.a, pushed: null }).action).toBe(
      "remote_missing",
    );
    expect(decide({ local: H.b, remote: null, remoteSeen: H.a, pushed: null }).action).toBe(
      "remote_missing",
    );
  });
  it("waits quietly for a pull request on a brand new file", () => {
    expect(decide({ local: H.a, remote: null, remoteSeen: null, pushed: H.a }).action).toBe("none");
  });
});
