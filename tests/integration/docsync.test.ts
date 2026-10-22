import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import {
  documentLinks,
  documents,
  documentVersions,
  notifications,
  projectSyncRequests,
  projects,
  repositoryConnections,
} from "@/lib/db/schema";
import { resolveConflict, syncProject } from "@/lib/docsync/engine";
import { hashContent } from "@/lib/docsync/hash";
import { saveDocument, setDocumentStatus } from "@/lib/documents/service";
import { GitError } from "@/lib/git/types";
import { createUser, resetDatabase } from "../helpers/db";
import { fakeHost } from "../helpers/fake-host";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let projectId: string;

async function setup(enabled = true) {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
  projectId = p.id;
  await db.insert(repositoryConnections).values({
    projectId,
    provider: "github",
    fullName: "acme/shop",
    status: "connected",
    docSyncEnabled: enabled,
    createdBy: owner.id,
  });
}

const doc = async (docSlug: string) => {
  const [d] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.slug, docSlug)));
  return d;
};
const link = async (docSlug: string) => {
  const d = await doc(docSlug);
  const [l] = await db.select().from(documentLinks).where(eq(documentLinks.documentId, d.id));
  return l;
};
const versions = async (docSlug: string) =>
  (
    await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, (await doc(docSlug)).id))
  ).length;
const edit = async (docSlug: string, content: string) =>
  saveDocument(owner, slug, { docSlug, content, baseVersion: (await doc(docSlug)).version });

describe("document sync: Saqina to the repository", () => {
  beforeEach(() => setup());

  it("sends documents to a dedicated branch and opens one pull request, never touching main", async () => {
    const host = fakeHost();
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary).toMatchObject({ pushed: 2, pulled: 0, conflicts: 0 });
    expect(summary.prUrl).toBe("https://github.com/acme/shop/pull/1");
    expect([...(host.branch("saqina/docs-sync") ?? new Map()).keys()].sort()).toEqual([
      "docs/PLAN.md",
      "docs/PRD.md",
    ]);
    expect(host.main().size).toBe(0);
    expect((await link("prd")).state).toBe("pending_pr");
    const [conn] = await db.select().from(repositoryConnections);
    expect(conn.docsPrUrl).toBe("https://github.com/acme/shop/pull/1");
    expect(conn.docsSyncError).toBeNull();
  });

  it("does nothing the second time and never writes an identical commit", async () => {
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    const commits = host.log.filter((l) => l.startsWith("commit")).length;
    const again = await syncProject(projectId, { adapter: host.adapter });
    expect(again).toMatchObject({ pushed: 0, pulled: 0, conflicts: 0, merged: 0 });
    expect(host.log.filter((l) => l.startsWith("commit"))).toHaveLength(commits);
  });

  it("updates the same pull request when more changes arrive, and recognises the merge without pulling it back", async () => {
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    await edit("prd", "# PRD\n\nEdited while the pull request was open.\n");
    const second = await syncProject(projectId, { adapter: host.adapter });
    expect(second.pushed).toBe(1);
    expect(host.prs).toHaveLength(1);
    expect(host.log).toContain("pr-update 1");

    const before = await versions("prd");
    host.mergePr();
    const merged = await syncProject(projectId, { adapter: host.adapter });
    expect(merged).toMatchObject({ merged: 2, pulled: 0, pushed: 0, conflicts: 0 });
    expect(await versions("prd")).toBe(before);
    expect((await link("prd")).state).toBe("synced");
    const [conn] = await db.select().from(repositoryConnections);
    expect(conn.docsPrNumber).toBeNull();
  });

  it("starts the branch afresh from the base after a merge", async () => {
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    host.mergePr();
    await syncProject(projectId, { adapter: host.adapter });
    await edit("plan", "# PLAN\n\nA later change.\n");
    const next = await syncProject(projectId, { adapter: host.adapter });
    expect(next.pushed).toBe(1);
    expect(host.prs).toHaveLength(2);
    expect(host.log).toContain("reset saqina/docs-sync");
  });

  it("never syncs business documents", async () => {
    await db.insert(documents).values({
      projectId,
      type: "agreement",
      title: "Agreement",
      slug: "agreement",
      content: "Price: Rp100.000.000",
    });
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    const files = [...(host.branch("saqina/docs-sync") ?? new Map()).keys()];
    expect(files.join()).not.toContain("agreement");
    expect(await link("agreement")).toBeUndefined();
  });

  it("stays idle when sync is switched off", async () => {
    await db.update(repositoryConnections).set({ docSyncEnabled: false });
    const host = fakeHost();
    expect(await syncProject(projectId, { adapter: host.adapter })).toMatchObject({
      skipped: "disabled",
    });
    expect(host.log).toHaveLength(0);
  });
});

describe("document sync: the repository to Saqina", () => {
  beforeEach(() => setup());

  async function synced() {
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    host.mergePr();
    await syncProject(projectId, { adapter: host.adapter });
    return host;
  }

  it("saves a repository edit as a new Saqina version and does not push it back", async () => {
    const host = await synced();
    const before = await versions("prd");
    host.editMain("docs/PRD.md", "# PRD\n\nWritten in the repository.\n");
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary).toMatchObject({ pulled: 1, pushed: 0, conflicts: 0 });
    expect((await doc("prd")).content).toBe("# PRD\n\nWritten in the repository.\n");
    expect(await versions("prd")).toBe(before + 1);
    const [v] = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, (await doc("prd")).id),
          eq(documentVersions.version, before + 1),
        ),
      );
    expect(v.source).toBe("sync");
    // The pull itself must not make the project look dirty again.
    expect(await db.select().from(projectSyncRequests)).toHaveLength(0);
    const quiet = await syncProject(projectId, { adapter: host.adapter });
    expect(quiet).toMatchObject({ pulled: 0, pushed: 0 });
  });

  it("creates a document for a new file in the docs folder", async () => {
    const host = await synced();
    host.editMain("docs/api/guide.md", "# API guide\n\nEndpoints.\n");
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary.created).toBe(1);
    const created = await doc("repo-docs-api-guide");
    expect(created.type).toBe("custom");
    expect(created.content).toContain("Endpoints.");
    expect((await link("repo-docs-api-guide")).path).toBe("docs/api/guide.md");
    expect(await syncProject(projectId, { adapter: host.adapter })).toMatchObject({
      created: 0,
      pushed: 0,
    });
  });

  it("keeps a document whose repository file was deleted", async () => {
    const host = await synced();
    host.removeFromMain("docs/PLAN.md");
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary.missing).toBe(1);
    expect((await link("plan")).state).toBe("remote_missing");
    expect((await doc("plan")).content).toContain("#");
  });

  it("never overwrites a signed document, it reports a conflict instead", async () => {
    const host = await synced();
    await setDocumentStatus(owner, slug, { docSlug: "prd", status: "signed" });
    const original = (await doc("prd")).content;
    host.editMain("docs/PRD.md", "# PRD\n\nTampered in the repository.\n");
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary.conflicts).toBe(1);
    expect((await doc("prd")).content).toBe(original);
    expect((await link("prd")).state).toBe("conflict");
  });

  it("withdraws approval from a shared document that a repository edit changes", async () => {
    const host = await synced();
    await setDocumentStatus(owner, slug, { docSlug: "prd", status: "approved" });
    await db
      .update(documents)
      .set({ clientVisible: true })
      .where(eq(documents.id, (await doc("prd")).id));
    host.editMain("docs/PRD.md", "# PRD\n\nNew scope from the repository.\n");
    await syncProject(projectId, { adapter: host.adapter });
    const after = await doc("prd");
    expect(after.status).toBe("review");
    expect(after.clientVisible).toBe(false);
  });
});

describe("document sync: conflicts", () => {
  beforeEach(() => setup());

  async function conflicted() {
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    host.mergePr();
    await syncProject(projectId, { adapter: host.adapter });
    await edit("prd", "# PRD\n\nSaqina's version.\n");
    host.editMain("docs/PRD.md", "# PRD\n\nThe repository's version.\n");
    // Saqina's edit is pushed first, then the repository edit is found on the base branch.
    const summary = await syncProject(projectId, { adapter: host.adapter });
    return { host, summary };
  }

  it("keeps both texts and tells the team, without overwriting either", async () => {
    const { summary } = await conflicted();
    expect(summary.conflicts).toBe(1);
    expect((await doc("prd")).content).toBe("# PRD\n\nSaqina's version.\n");
    const l = await link("prd");
    expect(l.state).toBe("conflict");
    expect(l.conflictRemote).toBe("# PRD\n\nThe repository's version.\n");
    const [n] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "docs.conflict"));
    expect(n.userId).toBe(owner.id);
    expect(n.href).toBe(`/project/${slug}/documents`);
  });

  it("notifies once, however often the conflict is seen", async () => {
    const { host } = await conflicted();
    await syncProject(projectId, { adapter: host.adapter });
    await syncProject(projectId, { adapter: host.adapter });
    expect(
      await db.select().from(notifications).where(eq(notifications.type, "docs.conflict")),
    ).toHaveLength(1);
  });

  it("takes the repository's text when the person chooses it", async () => {
    const { host } = await conflicted();
    await resolveConflict(owner, slug, { docSlug: "prd", keep: "repo" }, { adapter: host.adapter });
    expect((await doc("prd")).content).toBe("# PRD\n\nThe repository's version.\n");
    expect((await link("prd")).state).toBe("synced");
    expect(await syncProject(projectId, { adapter: host.adapter })).toMatchObject({
      pulled: 0,
      pushed: 0,
      conflicts: 0,
    });
  });

  it("sends Saqina's text to the repository when the person keeps it", async () => {
    const { host } = await conflicted();
    await resolveConflict(
      owner,
      slug,
      { docSlug: "prd", keep: "saqina" },
      { adapter: host.adapter },
    );
    expect((await doc("prd")).content).toBe("# PRD\n\nSaqina's version.\n");
    expect(host.branch("saqina/docs-sync")?.get("docs/PRD.md")).toBe(
      "# PRD\n\nSaqina's version.\n",
    );
    expect((await link("prd")).state).toBe("pending_pr");
  });

  it("has nothing to resolve on a document that is not conflicted", async () => {
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    await expect(
      resolveConflict(owner, slug, { docSlug: "prd", keep: "repo" }, { adapter: host.adapter }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("document sync: imported documents", () => {
  beforeEach(() => setup());

  const imported = (path: string, body: string, suffix = "") =>
    `> Imported from https://github.com/acme/shop/blob/main/${path}${suffix}\n\n${body}`;

  it("adopts an imported document at its original path and never writes the import header back", async () => {
    const body = "# Shop\n\nOriginal readme.\n";
    await db.insert(documents).values({
      projectId,
      type: "custom",
      title: "README.md (GitHub)",
      slug: "repo-readme",
      content: imported("README.md", body),
    });
    const host = fakeHost({ "README.md": body });
    const first = await syncProject(projectId, { adapter: host.adapter });
    expect(first.adopted).toBe(1);
    expect(first.conflicts).toBe(0);
    expect((await link("repo-readme")).path).toBe("README.md");

    await edit("repo-readme", imported("README.md", "# Shop\n\nEdited in Saqina.\n"));
    await syncProject(projectId, { adapter: host.adapter });
    const pushed = host.branch("saqina/docs-sync")?.get("README.md");
    expect(pushed).toBe("# Shop\n\nEdited in Saqina.\n");
    expect(pushed).not.toContain("Imported from");
  });

  it("leaves a truncated import alone, since pushing it back would cut the file", async () => {
    await db.insert(documents).values({
      projectId,
      type: "custom",
      title: "docs/big.md (GitHub)",
      slug: "repo-docs-big",
      content: imported("docs/big.md", "first part only\n", " (truncated)"),
    });
    const full = "first part only\n...and the rest of the file\n";
    const host = fakeHost({ "docs/big.md": full });
    await syncProject(projectId, { adapter: host.adapter });
    expect(await link("repo-docs-big")).toBeUndefined();
    // The file was not rewritten, and it did not come back as a second document either.
    expect(host.branch("saqina/docs-sync")?.get("docs/big.md")).toBe(full);
    expect(host.log.filter((l) => l.startsWith("commit")).join()).not.toContain("docs/big.md");
    const slugs = (await db.select().from(documents).where(eq(documents.projectId, projectId))).map(
      (d) => d.slug,
    );
    expect(slugs.filter((s) => s.startsWith("repo-docs-big"))).toEqual(["repo-docs-big"]);
  });

  it("does not claim a document imported from another repository", async () => {
    await db.insert(documents).values({
      projectId,
      type: "custom",
      title: "README.md (GitHub)",
      slug: "repo-readme",
      content: "> Imported from https://github.com/other/thing/blob/main/README.md\n\nText\n",
    });
    const host = fakeHost();
    await syncProject(projectId, { adapter: host.adapter });
    expect(await link("repo-readme")).toBeUndefined();
  });
});

describe("document sync: running safely", () => {
  beforeEach(() => setup());

  it("clears the dirty flag only for edits it has seen", async () => {
    await edit("prd", "# PRD\n\nFirst edit.\n");
    expect(await db.select().from(projectSyncRequests)).toHaveLength(1);
    await syncProject(projectId, { adapter: fakeHost().adapter });
    expect(await db.select().from(projectSyncRequests)).toHaveLength(0);
  });

  it("lets one of two simultaneous runs skip instead of racing", async () => {
    const host = fakeHost();
    host.slowCommits(120);
    const [a, b] = await Promise.all([
      syncProject(projectId, { adapter: host.adapter }),
      syncProject(projectId, { adapter: host.adapter }),
    ]);
    const skipped = [a, b].filter((s) => s.skipped === "busy");
    expect(skipped).toHaveLength(1);
    expect(host.prs).toHaveLength(1);
    expect(host.log.filter((l) => l.startsWith("commit"))).toHaveLength(1);
  });

  it("records a host failure and keeps the project flagged for a retry", async () => {
    await edit("prd", "# PRD\n\nPending.\n");
    const host = fakeHost();
    host.failNextTree(new GitError("rate_limited"));
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary.error).toBe("rate_limited");
    const [conn] = await db.select().from(repositoryConnections);
    expect(conn.docsSyncError).toBe("rate_limited");
    expect(await db.select().from(projectSyncRequests)).toHaveLength(1);
    host.failNextTree(null);
    const retry = await syncProject(projectId, { adapter: host.adapter });
    expect(retry.error).toBeUndefined();
    expect(retry.pushed).toBe(2);
  });

  it("hashes the way the engine does", () => {
    expect(hashContent("a\r\n")).toBe(hashContent("a\n"));
  });
});

describe("document sync: pull-only (GitHub is the source)", () => {
  beforeEach(async () => {
    await setup();
    await db.update(repositoryConnections).set({ docSyncMode: "pull_only" });
  });

  it("never sends anything: no branch, no pull request, the repository is untouched", async () => {
    const host = fakeHost();
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary).toMatchObject({ pushed: 0, pulled: 0, conflicts: 0, prUrl: null });
    expect(host.prs).toHaveLength(0);
    expect(host.main().size).toBe(0);
    expect(host.log.filter((l) => l.startsWith("commit") || l.startsWith("pr"))).toHaveLength(0);
  });

  it("when both sides changed, the more recent write wins: GitHub if it is newer", async () => {
    const host = fakeHost({ "docs/PRD.md": "# PRD\n\nFrom GitHub, first.\n" });
    await syncProject(projectId, { adapter: host.adapter });
    expect((await doc("prd")).content).toBe("# PRD\n\nFrom GitHub, first.\n");

    await edit("prd", "# PRD\n\nA local edit.\n");
    const idle = await syncProject(projectId, { adapter: host.adapter });
    expect(idle).toMatchObject({ pulled: 0, pushed: 0, conflicts: 0 });
    expect((await doc("prd")).content).toBe("# PRD\n\nA local edit.\n");

    const before = await versions("prd");
    host.editMain("docs/PRD.md", "# PRD\n\nFrom GitHub, later.\n", new Date(Date.now() + 60_000));
    const pulled = await syncProject(projectId, { adapter: host.adapter });
    expect(pulled).toMatchObject({ pulled: 1, pushed: 0, conflicts: 0 });
    expect((await doc("prd")).content).toBe("# PRD\n\nFrom GitHub, later.\n");
    expect(await versions("prd")).toBe(before + 1);
    expect(host.prs).toHaveLength(0);
  });

  it("keeps the Saqina text when it was written after the GitHub change", async () => {
    const host = fakeHost({ "docs/PRD.md": "# PRD\n\nFrom GitHub.\n" });
    await syncProject(projectId, { adapter: host.adapter });
    host.editMain("docs/PRD.md", "# PRD\n\nOlder GitHub edit.\n", new Date(Date.now() - 60_000));
    await edit("prd", "# PRD\n\nA newer local edit.\n");
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary).toMatchObject({ pulled: 0, pushed: 0, conflicts: 0 });
    expect((await doc("prd")).content).toBe("# PRD\n\nA newer local edit.\n");
    expect(host.prs).toHaveLength(0);
  });

  it("keeps a shared document visible to the client when GitHub updates it, and shows new files", async () => {
    const host = fakeHost({ "docs/guide.md": "# Guide\n\nFirst.\n" });
    await syncProject(projectId, { adapter: host.adapter });
    // A file that appeared in the docs folder becomes a document the client can read.
    const created = await doc("repo-docs-guide");
    expect(created).toMatchObject({ clientVisible: true, status: "approved" });

    host.editMain("docs/guide.md", "# Guide\n\nSecond.\n", new Date(Date.now() + 60_000));
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary.pulled).toBe(1);
    const after = await doc("repo-docs-guide");
    expect(after.content).toMatch(/^> Imported from .*\n\n# Guide\n\nSecond\.\n$/);
    expect(after).toMatchObject({ clientVisible: true, status: "approved" });
  });

  it("keeps the 'Imported from' header of a copied document when it follows GitHub", async () => {
    const header = "> Imported from https://github.com/acme/shop/blob/main/README.md\n\n";
    await db.insert(documents).values({
      projectId,
      type: "custom",
      title: "README.md (GitHub)",
      slug: "repo-readme",
      content: `${header}# Shop\n\nOld.\n`,
    });
    const host = fakeHost({ "README.md": "# Shop\n\nOld.\n" });
    await syncProject(projectId, { adapter: host.adapter });
    host.editMain("README.md", "# Shop\n\nNew on GitHub.\n");
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary.pulled).toBe(1);
    expect((await doc("repo-readme")).content).toBe(`${header}# Shop\n\nNew on GitHub.\n`);
  });
});

describe("document sync: the PRD is found again when the docs folder changes", () => {
  beforeEach(async () => {
    await setup();
    await db.update(repositoryConnections).set({ docSyncMode: "pull_only" });
    // The project starts without a PRD of its own: the repository has to bring it.
    await db
      .delete(documents)
      .where(and(eq(documents.projectId, projectId), eq(documents.slug, "prd")));
  });

  it("promotes a PRD that appears in a nested docs folder", async () => {
    const host = fakeHost({ "docs/specifications/prd.md": "# PRD\n\n## Goals\n\nTeach.\n" });
    const summary = await syncProject(projectId, { adapter: host.adapter });
    expect(summary.created).toBe(1);
    const prd = await doc("prd");
    expect(prd.type).toBe("prd");
    expect(prd.content).toContain("Teach.");
    // It keeps following GitHub under its new name.
    host.editMain(
      "docs/specifications/prd.md",
      "# PRD\n\n## Goals\n\nTeach more.\n",
      new Date(Date.now() + 60_000),
    );
    await syncProject(projectId, { adapter: host.adapter });
    expect((await doc("prd")).content).toContain("Teach more.");
  });
});
