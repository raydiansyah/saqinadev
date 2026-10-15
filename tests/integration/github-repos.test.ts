import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { type GitAdapter, GitError } from "@/lib/git/types";
import { getConnection, saveConnection } from "@/lib/github/connection";
import { listUserRepos, toPickerRepo } from "@/lib/github/repos";
import { importFromGithub } from "@/lib/imports/service";
import { createUser, resetDatabase } from "../helpers/db";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

let ana: Actor;
let ben: Actor;

beforeEach(async () => {
  await resetDatabase();
  ana = await createUser("Ana");
  ben = await createUser("Ben");
});

afterEach(() => vi.unstubAllGlobals());

const repoRow = (n: number, over: Record<string, unknown> = {}) => ({
  full_name: `ana/repo-${n}`,
  private: n % 2 === 0,
  description: `Repo ${n}`,
  pushed_at: "2026-10-01T00:00:00Z",
  archived: false,
  // Fields the picker must never pass on.
  owner: { login: "ana" },
  clone_url: "https://github.com/ana/repo.git",
  permissions: { admin: true },
  ...over,
});

describe("listing the connected user's repositories", () => {
  it("needs a connection", async () => {
    expect(await code(listUserRepos(ana))).toBe("NOT_FOUND");
  });

  it("sends the user's own token and returns a whitelist of fields only", async () => {
    await saveConnection(ana, { token: "gho_ana_token_0000", login: "ana" });
    const seen: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify([repoRow(1), repoRow(2), repoRow(3, { archived: true })]));
    });
    const repos = await listUserRepos(ana);
    expect(seen[0].auth).toBe("Bearer gho_ana_token_0000");
    expect(repos.map((r) => r.fullName)).toEqual(["ana/repo-1", "ana/repo-2"]);
    expect(Object.keys(repos[0]).sort()).toEqual([
      "description",
      "fullName",
      "private",
      "pushedAt",
    ]);
    expect(JSON.stringify(repos)).not.toContain("clone_url");
  });

  it("follows pages up to a limit", async () => {
    await saveConnection(ana, { token: "gho_ana_token_0000", login: "ana" });
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response(
        JSON.stringify(Array.from({ length: 100 }, (_, i) => repoRow(calls * 1000 + i))),
      );
    });
    expect(await listUserRepos(ana)).toHaveLength(300);
    expect(calls).toBe(3);
  });

  it("never uses another user's token", async () => {
    await saveConnection(ana, { token: "gho_ana_token_0000", login: "ana" });
    vi.stubGlobal("fetch", async () => new Response("[]"));
    expect(await code(listUserRepos(ben))).toBe("NOT_FOUND");
  });

  it("drops the connection when GitHub no longer accepts the token", async () => {
    await saveConnection(ana, { token: "gho_revoked_token_0", login: "ana" });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    expect(await code(listUserRepos(ana))).toBe("VALIDATION_ERROR");
    expect(await getConnection(ana)).toBeNull();
  });

  it("rejects malformed names from GitHub", () => {
    expect(toPickerRepo({ full_name: "bad name/../x" })).toBeNull();
    expect(toPickerRepo({ full_name: 42 })).toBeNull();
  });
});

describe("import with the GitHub connection", () => {
  const adapter = (tokens: (string | null)[]): GitAdapter => {
    const fail = async (): Promise<never> => {
      throw new GitError("unsupported");
    };
    return {
      provider: "github",
      getRepository: async (ref, token) => {
        tokens.push(token);
        return { fullName: ref.fullName, externalId: "1", defaultBranch: "main", headSha: "a" };
      },
      listFiles: async (_ref, token, input) => {
        tokens.push(token);
        return input.path ? [] : [{ path: "README.md", type: "file" as const, size: 80 }];
      },
      readFile: async () => "# Shop\n\nAn online shop for a bakery with orders and payments.\n",
      listBranches: fail,
      searchCode: fail,
      createBranch: fail,
      commitChanges: fail,
      createPullRequest: fail,
    };
  };

  it("reads the repo with the user's token and hands the same token to the connection", async () => {
    await saveConnection(ana, { token: "gho_ana_token_0000", login: "ana" });
    const tokens: (string | null)[] = [];
    const connect = vi.fn(async () => undefined);
    await importFromGithub(
      ana,
      { repo: "ana/shop", useConnection: true, token: "pasted_should_be_ignored" },
      "en",
      { adapter: adapter(tokens), connect },
    );
    expect(tokens.length).toBeGreaterThan(0);
    expect(new Set(tokens)).toEqual(new Set(["gho_ana_token_0000"]));
    expect(connect).toHaveBeenCalledWith(
      ana,
      expect.any(String),
      expect.objectContaining({ token: "gho_ana_token_0000" }),
    );
  });

  it("refuses to use a connection that does not exist, and creates nothing", async () => {
    const tokens: (string | null)[] = [];
    await expect(
      importFromGithub(ben, { repo: "ben/shop", useConnection: true }, "en", {
        adapter: adapter(tokens),
        connect: vi.fn(async () => undefined),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { repo: "github_not_connected" } });
    expect(tokens).toEqual([]);
    expect(await db.select().from(projects)).toEqual([]);
  });

  it("still accepts a pasted token when the connection is not requested", async () => {
    const tokens: (string | null)[] = [];
    await importFromGithub(ana, { repo: "ana/shop", token: "pasted_token_value" }, "en", {
      adapter: adapter(tokens),
      connect: vi.fn(async () => undefined),
    });
    expect(new Set(tokens)).toEqual(new Set(["pasted_token_value"]));
  });
});
