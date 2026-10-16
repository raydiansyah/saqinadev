import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { type FileEntry, type GitAdapter, GitError } from "@/lib/git/types";
import { importFromGithub } from "@/lib/imports/service";
import { completeInterview } from "@/lib/interviews/service";
import { listRequirements } from "@/lib/requirements/service";
import { createUser, resetDatabase } from "../helpers/db";

/** A PRD whose features are specific to this product, as a real repository's would be. */
const FILES: Record<string, string> = {
  "README.md":
    "# Bakery Orders\n\nAn ordering app for a neighbourhood bakery with pre-orders and pickup slots.\n",
  "PRD.md": `# Product requirements

## Features

- Customers reserve a pickup time slot for each pre-order
- Bakers see a daily production list grouped by product
- Loyalty stamps: every tenth loaf is free
- Order status updates sent by WhatsApp message
- Refunds for cancelled pre-orders within 24 hours

## Business rules

- Pre-orders close at 18:00 the day before pickup
- A slot holds at most 10 orders
`,
  "package.json": JSON.stringify({ dependencies: { next: "16", pg: "8" } }),
};

function adapter(files: Record<string, string>): GitAdapter {
  const fail = async (): Promise<never> => {
    throw new GitError("unsupported");
  };
  return {
    provider: "github",
    getRepository: async (ref) => ({
      fullName: ref.fullName,
      externalId: "1",
      defaultBranch: "main",
      headSha: "abc",
    }),
    listFiles: async (_ref, _token, input) => {
      const dir = input.path ? `${input.path}/` : "";
      return Object.keys(files)
        .filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes("/"))
        .map((p): FileEntry => ({ path: p, type: "file", size: files[p].length }));
    },
    readFile: async (_ref, _token, input) => {
      if (!(input.path in files)) throw new GitError("not_found");
      return files[input.path];
    },
    listBranches: fail,
    searchCode: fail,
    createBranch: fail,
    commitChanges: fail,
    createPullRequest: fail,
  };
}

describe("requirements after importing a repository", () => {
  let owner: Actor;
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner", "owner@example.test");
  });

  async function importAndComplete() {
    const { slug } = await importFromGithub(owner, { repo: "acme/bakery" }, "en", {
      adapter: adapter(FILES),
      connect: vi.fn(async () => undefined),
    });
    await completeInterview(owner, slug);
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    const access = await loadProjectAccess(owner, { slug }, "project:read");
    return { project, requirements: await listRequirements(access) };
  }

  it("reflects what the repository's documents actually say", async () => {
    const { requirements } = await importAndComplete();
    const text = requirements.map((r) => `${r.title} ${r.description}`.toLowerCase()).join("\n");
    // Features and rules named in the PRD must show up as requirements, not only generic ones.
    for (const expected of ["pickup", "production list", "loyalty", "whatsapp", "refund", "18:00"])
      expect(text, expected).toContain(expected);
  });
});

describe("what the imported requirements look like", () => {
  let owner: Actor;
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner", "owner@example.test");
  });

  async function run(files: Record<string, string>) {
    const { slug } = await importFromGithub(owner, { repo: "acme/bakery" }, "en", {
      adapter: adapter(files),
      connect: vi.fn(async () => undefined),
    });
    await completeInterview(owner, slug);
    return listRequirements(await loadProjectAccess(owner, { slug }, "project:read"));
  }

  const fromDocs = (reqs: Awaited<ReturnType<typeof listRequirements>>) =>
    reqs.filter((r) => r.description.includes("Source: "));

  it("marks them imported and unconfirmed, with their source, grouped by what the PRD says", async () => {
    const reqs = await run(FILES);
    const loyalty = reqs.find((r) => r.title.toLowerCase().includes("loyalty"));
    expect(loyalty).toMatchObject({ group: "features", status: "inferred", source: "imported" });
    expect(loyalty?.description).toContain("Source: PRD.md › Features");
    const rule = reqs.find((r) => r.title.includes("18:00"));
    expect(rule?.group).toBe("business_rules");
    // Nothing taken from the documents arrives as confirmed.
    expect(fromDocs(reqs).length).toBeGreaterThan(3);
    expect(fromDocs(reqs).every((r) => r.status === "inferred" && r.source === "imported")).toBe(
      true,
    );
  });

  it("does not turn setup instructions into requirements", async () => {
    const reqs = await run({
      ...FILES,
      "README.md":
        "# Bakery Orders\n\nAn ordering app for a bakery.\n\n## Installation\n- Run pnpm install and copy the env file\n",
    });
    expect(reqs.some((r) => r.title.toLowerCase().includes("pnpm install"))).toBe(false);
  });

  it("keeps the generic requirements alongside the imported ones", async () => {
    const reqs = await run(FILES);
    expect(reqs.some((r) => !r.description.includes("Source: "))).toBe(true);
    expect(fromDocs(reqs).length).toBeGreaterThan(0);
  });

  it("adds nothing for a project that was not imported", async () => {
    const { project } = await import("../helpers/project");
    const slug = await project(owner, "A web shop with login and payments for my bakery.");
    const reqs = await listRequirements(await loadProjectAccess(owner, { slug }, "project:read"));
    expect(reqs.some((r) => r.description.includes("Source: "))).toBe(false);
  });
});
