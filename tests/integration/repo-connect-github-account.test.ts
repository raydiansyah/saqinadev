import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { credentials, projects, repositoryConnections } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { GIT_ADAPTERS } from "@/lib/git/adapters";
import { connectRepository } from "@/lib/git/service";
import { saveConnection } from "@/lib/github/connection";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

const TOKEN = "gho_account_token_123";
let owner: Actor;
let outsider: Actor;
let slug: string;
let seen: (string | null)[];

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  outsider = await createUser("Outsider", "outsider@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  seen = [];
  vi.spyOn(GIT_ADAPTERS.github, "getRepository").mockImplementation(async (ref, token) => {
    seen.push(token ?? null);
    return { fullName: ref.fullName, externalId: "42", defaultBranch: "main", headSha: "abc123" };
  });
});

afterEach(() => vi.restoreAllMocks());

describe("connecting a repository with the GitHub account", () => {
  it("uses the connected account instead of a pasted token, and keeps the token encrypted", async () => {
    await saveConnection(owner, { token: TOKEN, login: "owner-dev" });
    await connectRepository(owner, slug, {
      provider: "github",
      fullName: "acme/shop",
      useConnection: true,
    });
    // The probe, and the first sync that follows with the token now stored for the project.
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([TOKEN]));

    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    const [conn] = await db
      .select()
      .from(repositoryConnections)
      .where(eq(repositoryConnections.projectId, p.id));
    expect(conn).toMatchObject({ provider: "github", fullName: "acme/shop", status: "connected" });
    const stored = (await db.select().from(credentials)).filter((c) => c.scope === "project");
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored[0])).not.toContain(TOKEN);
  });

  it("says not found when the person has not connected GitHub, and stores nothing", async () => {
    expect(
      await code(
        connectRepository(owner, slug, {
          provider: "github",
          fullName: "acme/shop",
          useConnection: true,
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(seen).toEqual([]);
    expect(await db.select().from(repositoryConnections)).toHaveLength(0);
  });

  it("is only for GitHub", async () => {
    await saveConnection(owner, { token: TOKEN, login: "owner-dev" });
    expect(
      await code(
        connectRepository(owner, slug, {
          provider: "gitlab",
          fullName: "acme/shop",
          useConnection: true,
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  it("never lends one person's account to another project", async () => {
    await saveConnection(outsider, { token: TOKEN, login: "outsider-dev" });
    expect(
      await code(
        connectRepository(outsider, slug, {
          provider: "github",
          fullName: "acme/shop",
          useConnection: true,
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(seen).toEqual([]);
  });
});
