import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { updateProjectSettings } from "@/lib/projects/service";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let owner: Actor;
let slug: string;
let projectId: string;

const stored = async () =>
  (await db.select().from(projectSettings).where(eq(projectSettings.projectId, projectId)))[0];
const payload = (over: Record<string, unknown> = {}) => ({
  buildStrategy: "external",
  repoProvider: "github",
  repoUrl: "https://github.com/acme/pos",
  defaultBranch: "main",
  deployProvider: "vercel",
  environment: "production",
  domain: "pos.example.com",
  aiProvider: "",
  aiModel: "",
  ...over,
});

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  slug = await project(owner, "A point of sale for a small restaurant with table orders.");
  projectId = (await loadProjectAccess(owner, { slug }, "project:read")).project.id;
});

describe("technical preferences", () => {
  it("saves every field", async () => {
    await updateProjectSettings(owner, slug, payload());
    expect(await stored()).toMatchObject({
      repoProvider: "github",
      repoUrl: "https://github.com/acme/pos",
      defaultBranch: "main",
      deployProvider: "vercel",
      environment: "production",
      domain: "pos.example.com",
    });
  });

  it("takes a repository URL typed without https", async () => {
    await updateProjectSettings(owner, slug, payload({ repoUrl: "github.com/acme/pos" }));
    expect((await stored()).repoUrl).toBe("https://github.com/acme/pos");
  });

  it("refuses a bad value as a whole and changes nothing", async () => {
    await updateProjectSettings(owner, slug, payload());
    const error = await updateProjectSettings(
      owner,
      slug,
      payload({ defaultBranch: "develop", domain: "not a domain" }),
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).fields).toHaveProperty("domain");
    expect(await stored()).toMatchObject({ defaultBranch: "main", domain: "pos.example.com" });
  });

  it("keeps the AI provider and model that are stored when they are passed back", async () => {
    await db
      .insert(projectSettings)
      .values({ projectId, aiProvider: "anthropic", aiModel: "x" })
      .onConflictDoUpdate({
        target: projectSettings.projectId,
        set: { aiProvider: "anthropic", aiModel: "x" },
      });
    await updateProjectSettings(owner, slug, payload({ aiProvider: "anthropic", aiModel: "x" }));
    expect(await stored()).toMatchObject({ aiProvider: "anthropic", aiModel: "x" });
  });
});
