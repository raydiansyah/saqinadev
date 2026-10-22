import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import {
  codeFiles,
  codeIndexes,
  codeSymbols,
  memoryAssets,
  memoryJobs,
  projectMembers,
  repositoryConnections,
} from "@/lib/db/schema";
import { connectRepository } from "@/lib/git/service";
import { GitError, type SyncAdapter } from "@/lib/git/types";
import { callersOf, findSymbols, impactOf, listRevisions } from "@/lib/memory/code/queries";
import { enqueueCodeIndex, purgeCodeIndexes } from "@/lib/memory/code/schedule";
import { processMemoryJobs } from "@/lib/memory/jobs";
import type { Principal } from "@/lib/memory/policy";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

/** A repository as a map of files; the fake host counts what is read from it. */
function fakeHost(initial: Record<string, string>) {
  const host = {
    files: { ...initial },
    head: "c0ffee01",
    reads: [] as string[],
    treeCalls: 0,
    fail: null as GitError | null,
  };
  const sha = (text: string) => createHash("sha1").update(text).digest("hex");
  const adapter = {
    provider: "github",
    getRepository: async () => ({
      fullName: "acme/shop",
      externalId: null,
      defaultBranch: "main",
      headSha: host.head,
    }),
    listBranches: async () => [
      { name: "main", sha: host.head },
      { name: "dev", sha: "dddd0001" },
    ],
    getTree: async () => {
      host.treeCalls++;
      if (host.fail) throw host.fail;
      return Object.entries(host.files).map(([path, text]) => ({
        path,
        size: text.length,
        sha: sha(text),
      }));
    },
    readFile: async (_r: unknown, _t: unknown, input: { path: string }) => {
      host.reads.push(input.path);
      const text = host.files[input.path];
      if (text === undefined) throw new GitError("not_found");
      return text;
    },
  } as unknown as SyncAdapter;
  return { host, adapter };
}

const REPO = {
  "tsconfig.json": '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
  "src/a.ts":
    'import { helper } from "./b";\nimport { make } from "@/c";\nexport function run() {\n  helper();\n  make();\n}\n',
  "src/b.ts": "export function helper() {}\nexport function unused() {}\n",
  "src/c.ts": "export function make() {}\n",
  "tests/a.test.ts": 'import { run } from "../src/a";\nrun();\n',
  "README.md": "# not code",
  "node_modules/x/index.js": "export function ignored() {}",
};

let alice: Actor;
let carol: Actor;
let eve: Actor;
let projectId: string;
let otherProject: string;
let projectSlug: string;

const asUser = (a: Actor, role: "owner" | "viewer" = "owner"): Principal => ({
  kind: "user",
  userId: a.id,
  role,
});
const agent = (canReadMemory = true): Principal => ({
  kind: "agent",
  agentId: "00000000-0000-4000-8000-000000000009",
  creatorId: alice.id,
  canReadMemory,
});

async function drain(adapter: SyncAdapter) {
  for (let i = 0; i < 12; i++) {
    const out = await processMemoryJobs({ codeAdapter: adapter });
    if (out.ready + out.failed === 0) return;
  }
}
const index = (adapter: SyncAdapter, key: string, branch?: string) =>
  enqueueCodeIndex(db, { projectId, key, branch }).then(() => drain(adapter));

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  carol = await createUser("Carol");
  eve = await createUser("Eve");
  const slug = await project(alice, "A web shop with login and payments for my bakery.");
  const slugB = await project(eve, "A recipe sharing app for home cooks and friends.");
  projectSlug = slug;
  projectId = (await loadProjectAccess(alice, { slug }, "project:read")).project.id;
  otherProject = (await loadProjectAccess(eve, { slug: slugB }, "project:read")).project.id;
  await db.insert(projectMembers).values({ projectId, userId: carol.id, role: "viewer" });
  await db.insert(repositoryConnections).values({
    projectId,
    provider: "github",
    fullName: "acme/shop",
    defaultBranch: "main",
    status: "connected",
    headSha: "c0ffee01",
  });
});

describe("reading a repository", () => {
  it("indexes source files at one commit and answers where things are", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "first");
    const [rev] = await listRevisions(asUser(alice), projectId);
    expect(rev).toMatchObject({
      branch: "main",
      commitSha: "c0ffee01",
      status: "ready",
      stale: false,
      pendingFiles: 0,
    });
    expect(rev.parser).toMatch(/^typescript@/);
    expect(rev.fileCount).toBe(4); // README and node_modules are not source

    const found = await findSymbols(asUser(alice), projectId, { query: "run" });
    expect(found.revision?.commitSha).toBe("c0ffee01");
    expect(found.items[0]).toMatchObject({
      name: "run",
      kind: "function",
      exported: true,
      path: "src/a.ts",
      startLine: 3,
    });
  });

  it("ties calls to symbols through imports and aliases, and marks what it cannot tie", async () => {
    const { adapter } = fakeHost({
      ...REPO,
      "src/d.ts": "export function other() { helper(); }\nfunction helper() {}\n",
    });
    await index(adapter, "first");
    const helper = (await findSymbols(asUser(alice), projectId, { query: "helper" })).items.find(
      (s) => s.path === "src/b.ts",
    );
    const callers = await callersOf(asUser(alice), projectId, { symbolId: helper?.id as string });
    const resolved = callers.items.filter((c) => c.resolution === "resolved");
    expect(resolved.map((c) => [c.path, c.caller])).toEqual([["src/a.ts", "run"]]);
    // d.ts calls its own private helper(): not this one, and it is not offered as a resolved caller.
    expect(callers.items.some((c) => c.path === "src/d.ts" && c.resolution === "resolved")).toBe(
      false,
    );

    const make = (await findSymbols(asUser(alice), projectId, { query: "make" })).items[0];
    expect(
      (await callersOf(asUser(alice), projectId, { symbolId: make.id })).items[0],
    ).toMatchObject({
      resolution: "resolved",
      path: "src/a.ts",
    });
  });

  it("says which files and tests a change may reach", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "first");
    const impact = await impactOf(asUser(alice), projectId, { path: "src/b.ts" });
    expect(impact.dependents).toEqual([{ path: "src/a.ts", depth: 1, isTest: false }]);
    expect(impact.tests).toEqual([{ path: "tests/a.test.ts", depth: 2, isTest: true }]);
    expect(impact.file?.exports.map((e) => e.name)).toEqual(["helper", "unused"]);
    expect((await impactOf(asUser(alice), projectId, { path: "src/missing.ts" })).file).toBeNull();
  });

  it("says when the list of affected files stops short", async () => {
    // A chain of seven files, each importing the one before: more levels than are followed.
    const chain: Record<string, string> = { "src/f0.ts": "export function f0() {}\n" };
    for (let i = 1; i <= 7; i++) {
      chain[`src/f${i}.ts`] =
        `import { f${i - 1} } from "./f${i - 1}";\nexport function f${i}() { f${i - 1}(); }\n`;
    }
    const { adapter } = fakeHost(chain);
    await index(adapter, "first");
    const long = await impactOf(asUser(alice), projectId, { path: "src/f0.ts" });
    expect(long.truncated).toBe(true);
    expect(long.dependents.map((d) => d.depth)).toEqual([1, 2, 3]);
    const short = await impactOf(asUser(alice), projectId, { path: "src/f6.ts" });
    expect(short).toMatchObject({ truncated: false });
    expect(short.dependents.map((d) => d.path)).toEqual(["src/f7.ts"]);
  });

  it("reads only what changed when the branch moves, and does nothing when it has not", async () => {
    const { host, adapter } = fakeHost(REPO);
    await index(adapter, "first");
    const firstReads = host.reads.length;

    host.reads.length = 0;
    await index(adapter, "again"); // same commit
    expect(host.reads).toEqual([]);

    host.head = "c0ffee02";
    host.files["src/b.ts"] = "export function helper() {}\nexport function fresh() {}\n";
    delete host.files["src/c.ts"];
    await index(adapter, "moved");
    expect(host.reads.filter((p) => p.endsWith(".ts") && p !== "tsconfig.json")).toEqual([
      "src/b.ts",
    ]);
    expect(firstReads).toBeGreaterThan(host.reads.length);

    const symbols = (await findSymbols(asUser(alice), projectId, { query: "fresh" })).items;
    expect(symbols.map((s) => s.path)).toEqual(["src/b.ts"]);
    expect((await findSymbols(asUser(alice), projectId, { query: "unused" })).items).toEqual([]);
    expect((await findSymbols(asUser(alice), projectId, { query: "make" })).items).toEqual([]);
    const [rev] = await listRevisions(asUser(alice), projectId);
    expect(rev).toMatchObject({ commitSha: "c0ffee02", fileCount: 3 });
  });

  it("flags an index as stale when the branch has a newer commit", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "first");
    await db
      .update(repositoryConnections)
      .set({ headSha: "feedbeef" })
      .where(eq(repositoryConnections.projectId, projectId));
    expect((await listRevisions(asUser(alice), projectId))[0].stale).toBe(true);
    expect((await findSymbols(asUser(alice), projectId, { query: "run" })).revision?.stale).toBe(
      true,
    );
  });

  it("reads a large repository in batches that each stand alone", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 130; i++) many[`src/m${i}.ts`] = `export function f${i}() {}\n`;
    const { adapter } = fakeHost(many);
    await index(adapter, "first");
    const [rev] = await listRevisions(asUser(alice), projectId);
    expect(rev).toMatchObject({
      status: "ready",
      fileCount: 130,
      symbolCount: 130,
      pendingFiles: 0,
    });
    expect(
      (await db.select().from(memoryJobs)).filter((j) => j.kind === "index_code").length,
    ).toBeGreaterThan(2);
  });

  it("skips a file that is too large, survives a broken one, and keeps a failed read for retry", async () => {
    const { host, adapter } = fakeHost({
      ...REPO,
      "src/broken.ts": "export function ok() {}\nexport function ( {{{ \n",
    });
    host.files["src/big.ts"] = `export const x = 1;\n${"//".padEnd(210_000, "x")}`;
    await index(adapter, "first");
    const files = await db.select().from(codeFiles);
    expect(files.find((f) => f.path === "src/big.ts")).toMatchObject({
      status: "skipped",
      reason: "too_large",
    });
    expect(files.find((f) => f.path === "src/broken.ts")?.status).toBe("parsed");
    expect((await findSymbols(asUser(alice), projectId, { query: "ok" })).items.length).toBe(1);
  });

  it("does not let one hostile file stop the files behind it", async () => {
    const { adapter } = fakeHost({
      "src/aaa-deep.ts": `const a = ${"[".repeat(5000)}${"]".repeat(5000)};\n`,
      "src/bbb-imports.ts": `${'import"x";'.repeat(5000)}\nexport function many() {}\n`,
      "src/ccc-nul.ts": 'import "a\u0000b";\nexport function nul() {}\n',
      "src/zzz-ok.ts": "export function fine() {}\n",
    });
    await index(adapter, "first");
    const files = await db.select().from(codeFiles);
    expect(files.find((f) => f.path === "src/aaa-deep.ts")).toMatchObject({
      status: "failed",
      reason: "parse_error",
    });
    expect(files.filter((f) => f.status === "pending")).toHaveLength(0);
    expect((await listRevisions(asUser(alice), projectId))[0].status).toBe("ready");
    for (const name of ["many", "nul", "fine"]) {
      expect((await findSymbols(asUser(alice), projectId, { query: name })).items).toHaveLength(1);
    }
  });

  it("keeps going when files that cannot be read sort first, and gives them another try on a new commit", async () => {
    const files: Record<string, string> = { "src/zz.ts": "export function last() {}\n" };
    for (let i = 0; i < 70; i++)
      files[`src/a${String(i).padStart(2, "0")}.ts`] = "export const x = 1;\n";
    const { host, adapter } = fakeHost(files);
    const unreadable = new Set(Object.keys(files).filter((p) => p.startsWith("src/a")));
    const real = host.files;
    (adapter as unknown as { readFile: unknown }).readFile = async (
      _r: unknown,
      _t: unknown,
      i: { path: string },
    ) => {
      if (unreadable.has(i.path)) throw new GitError("not_found");
      return real[i.path];
    };
    await index(adapter, "first");
    expect((await findSymbols(asUser(alice), projectId, { query: "last" })).items).toHaveLength(1);
    expect(
      (await db.select().from(codeFiles)).filter((f) => f.reason === "read_failed"),
    ).toHaveLength(70);
    unreadable.clear();
    host.head = "c0ffee09";
    await index(adapter, "later");
    expect((await db.select().from(codeFiles)).filter((f) => f.status === "parsed")).toHaveLength(
      71,
    );
  });

  it("serves the default branch only, and says which repository it describes", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "dev", "dev");
    // Only a non-default branch is indexed: nothing is offered as if it were the default.
    expect(await findSymbols(asUser(alice), projectId, { query: "run" })).toEqual({
      revision: null,
      items: [],
    });
    expect(
      (await findSymbols(asUser(alice), projectId, { query: "run", branch: "dev" })).revision,
    ).toMatchObject({
      repository: "acme/shop",
      branch: "dev",
    });
  });

  it("keeps the connection's head current so stale compares with the truth", async () => {
    const { host, adapter } = fakeHost(REPO);
    await index(adapter, "first");
    host.head = "c0ffee77";
    await index(adapter, "second");
    const [conn] = await db.select().from(repositoryConnections);
    expect(conn.headSha).toBe("c0ffee77");
    expect((await listRevisions(asUser(alice), projectId))[0]).toMatchObject({
      commitSha: "c0ffee77",
      stale: false,
    });
  });

  it("reads everything again when the parser changes", async () => {
    const { host, adapter } = fakeHost(REPO);
    await index(adapter, "first");
    await db.update(codeIndexes).set({ parser: "typescript@0.0.0" });
    host.reads.length = 0;
    await index(adapter, "again");
    expect(host.reads.filter((p) => p.endsWith(".ts") && p !== "tsconfig.json").length).toBe(4);
    expect((await db.select().from(codeIndexes))[0].parser).toMatch(/^typescript@5/);
  });

  it("marks the index failed and retries when the host refuses, then recovers", async () => {
    const { host, adapter } = fakeHost(REPO);
    await index(adapter, "first");
    host.head = "c0ffee03";
    host.fail = new GitError("rate_limited");
    await index(adapter, "limited");
    expect((await db.select().from(codeIndexes))[0]).toMatchObject({
      status: "failed",
      errorCode: "rate_limited",
    });
    host.fail = null;
    await db.update(memoryJobs).set({ runAfter: new Date() });
    await drain(adapter);
    expect((await db.select().from(codeIndexes))[0]).toMatchObject({
      status: "ready",
      commitSha: "c0ffee03",
    });
  });

  it("leaves no duplicates when two runs read the same branch at once", async () => {
    const { adapter } = fakeHost(REPO);
    await enqueueCodeIndex(db, { projectId, key: "one" });
    await enqueueCodeIndex(db, { projectId, key: "two" });
    await Promise.all([
      processMemoryJobs({ limit: 1, codeAdapter: adapter }),
      processMemoryJobs({ limit: 1, codeAdapter: adapter }),
    ]);
    await drain(adapter);
    expect(await db.select().from(codeIndexes)).toHaveLength(1);
    const names = (await db.select().from(codeSymbols)).map((s) => s.name).sort();
    expect(names).toEqual([...new Set(names)]);
    expect((await listRevisions(asUser(alice), projectId))[0].status).toBe("ready");
  });

  it("drops what it was reading if the repository is disconnected before it finishes", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "first");
    const [idx] = await db.select().from(codeIndexes);
    await db
      .update(repositoryConnections)
      .set({ status: "disconnected" })
      .where(eq(repositoryConnections.projectId, projectId));
    const { linkAndFinish } = await import("@/lib/memory/code/link");
    await linkAndFinish({
      indexId: idx.id,
      projectId,
      head: "x",
      title: "t",
      aliases: {},
      partial: false,
    });
    expect(await db.select().from(codeIndexes)).toHaveLength(0);
    expect(await db.select().from(codeSymbols)).toHaveLength(0);
  });

  it("does nothing for a host it cannot list, and for a disconnected repository", async () => {
    const { adapter } = fakeHost(REPO);
    await db
      .update(repositoryConnections)
      .set({ provider: "gitlab" })
      .where(eq(repositoryConnections.projectId, projectId));
    await enqueueCodeIndex(db, { projectId, key: "x" });
    expect(await processMemoryJobs()).toEqual({ ready: 1, failed: 0 });
    expect(await db.select().from(codeIndexes)).toHaveLength(0);
    await db
      .update(repositoryConnections)
      .set({ provider: "github", status: "disconnected" })
      .where(eq(repositoryConnections.projectId, projectId));
    await index(adapter, "y");
    expect(await db.select().from(codeIndexes)).toHaveLength(0);
  });
});

describe("connecting a repository over an existing one", () => {
  /** GitHub answering for one repository: its record, its default branch and an empty root. */
  const github = (name: string, id: number, sha: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (u.endsWith(`/repos/${name}`))
          return json({ id, full_name: name, default_branch: "main" });
        if (u.includes("/branches/main")) return json({ commit: { sha } });
        return json([]);
      }),
    );
  afterEach(() => vi.unstubAllGlobals());

  it("deletes the old graph when the repository is a different one, and queues the first read", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "first");
    expect(await db.select().from(codeIndexes)).toHaveLength(1);

    github("acme/other", 2, "0ther001");
    await connectRepository(alice, projectSlug, { provider: "github", fullName: "acme/other" });
    expect(await db.select().from(codeIndexes)).toHaveLength(0);
    expect(await db.select().from(codeSymbols)).toHaveLength(0);
    expect(await findSymbols(asUser(alice), projectId, { query: "run" })).toEqual({
      revision: null,
      items: [],
    });
    const queued = (await db.select().from(memoryJobs)).filter(
      (j) => j.kind === "index_code" && j.idempotencyKey.includes(":connect:"),
    );
    expect(queued.length).toBe(1);
  });

  it("keeps the graph when the same repository is connected again", async () => {
    const { adapter } = fakeHost(REPO);
    await db
      .update(repositoryConnections)
      .set({ externalId: "1" })
      .where(eq(repositoryConnections.projectId, projectId));
    await index(adapter, "first");
    github("acme/shop", 1, "c0ffee01");
    await connectRepository(alice, projectSlug, { provider: "github", fullName: "acme/shop" });
    expect(await db.select().from(codeIndexes)).toHaveLength(1);
    expect((await findSymbols(asUser(alice), projectId, { query: "run" })).items).toHaveLength(1);
  });
});

describe("who can ask, and what leaves with the connection", () => {
  it("answers members and agents allowed to read, never another project or an agent that may not", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "first");
    expect(
      (await findSymbols(asUser(carol, "viewer"), projectId, { query: "run" })).items,
    ).toHaveLength(1);
    expect((await findSymbols(agent(), projectId, { query: "run" })).items).toHaveLength(1);
    const blind = await findSymbols(agent(false), projectId, { query: "run" });
    expect(blind).toEqual({ revision: null, items: [] });
    // Another project's principal asking about this project's id gets nothing from another project's data.
    expect(await listRevisions(asUser(eve), otherProject)).toEqual([]);
    expect((await findSymbols(asUser(eve), otherProject, { query: "run" })).items).toEqual([]);
  });

  it("removes the index, its files and symbols when the repository is disconnected", async () => {
    const { adapter } = fakeHost(REPO);
    await index(adapter, "first");
    await db.transaction((tx) => purgeCodeIndexes(tx, projectId));
    expect(await db.select().from(codeIndexes)).toHaveLength(0);
    expect(await db.select().from(codeFiles)).toHaveLength(0);
    expect(await db.select().from(codeSymbols)).toHaveLength(0);
    expect(
      (await db.select().from(memoryAssets)).filter((a) => a.assetType === "code"),
    ).toHaveLength(0);
  });

  it("keeps no source text, only names, places and relationships", async () => {
    const { adapter } = fakeHost({
      "src/s.ts":
        'const SECRET = "sk-live-do-not-store";\nexport function f() { return SECRET; }\n',
    });
    await index(adapter, "first");
    const dump = JSON.stringify([
      await db.select().from(codeSymbols),
      await db.select().from(codeFiles),
    ]);
    expect(dump).not.toContain("sk-live");
  });
});
