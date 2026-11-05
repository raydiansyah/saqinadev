import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, memoryAssets, projectMembers, wikiSources } from "@/lib/db/schema";
import { CONSENT_VERSION, setSemanticSearch } from "@/lib/memory/embed/settings";
import { processMemoryJobs } from "@/lib/memory/jobs";
import type { Principal } from "@/lib/memory/policy";
import { syncWikiFromDocuments } from "@/lib/memory/wiki";
import { retrieveWiki } from "@/lib/memory/wiki/retrieve";
import { createUser, resetDatabase } from "../helpers/db";
import { installEmbeddingModel, removeEmbeddingModel } from "../helpers/embedding-model";
import { fakeEmbedder } from "../helpers/fake-embedder";
import { project } from "../helpers/project";

// The question shares no word with the passages; only the concept vector connects them.
const QUESTION = "how fast is a reimbursement";
const CONCEPTS = { reimbursement: 3, "refunds return": 3 };

let alice: Actor;
let bob: Actor;
let eve: Actor;
let slugA: string;
let slugB: string;
let projectA: string;
let projectB: string;
let embedder = fakeEmbedder("");

const asUser = (a: Actor, role: "owner" | "editor" = "editor"): Principal => ({
  kind: "user",
  userId: a.id,
  role,
});
const accessOf = (a: Actor, slug: string) => loadProjectAccess(a, { slug }, "project:read");
const headings = (r: { passages: { heading: string }[] }) => r.passages.map((p) => p.heading);

async function addDoc(projectId: string, slug: string, title: string, refunds: string) {
  const [d] = await db
    .insert(documents)
    .values({
      projectId,
      type: "custom",
      title,
      slug,
      content: `# ${title}\n\n## Refunds\n\n${refunds}\n`,
    })
    .returning();
  return d;
}

const ask = (projectId: string, p: Principal) =>
  retrieveWiki(p, projectId, { query: QUESTION, embedder });

async function embedAll(a: Actor, slug: string) {
  await setSemanticSearch(a, slug, { enabled: true, consent: CONSENT_VERSION });
  await processMemoryJobs({ embedder });
}

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  eve = await createUser("Eve");
  slugA = await project(alice, "A web shop with login and payments for my bakery.");
  slugB = await project(eve, "A recipe sharing app for home cooks and friends.");
  projectA = (await accessOf(alice, slugA)).project.id;
  projectB = (await accessOf(eve, slugB)).project.id;
  await db.insert(projectMembers).values({ projectId: projectA, userId: bob.id, role: "editor" });
  embedder = fakeEmbedder(await installEmbeddingModel(), { concepts: CONCEPTS });
});
afterEach(removeEmbeddingModel);

describe("what the wiki vector list refuses", () => {
  it("does not return a passage whose source is no longer ready", async () => {
    await addDoc(projectA, "billing", "Billing", "Refunds return within 7 days.");
    await syncWikiFromDocuments(projectA);
    await embedAll(alice, slugA);
    expect(headings(await ask(projectA, asUser(bob)))).toContain("Billing › Refunds");
    await db
      .update(wikiSources)
      .set({ status: "failed" })
      .where(eq(wikiSources.projectId, projectA));
    expect(headings(await ask(projectA, asUser(bob)))).not.toContain("Billing › Refunds");
  });

  it("never returns another project's passage, even with the identical meaning", async () => {
    await addDoc(projectA, "billing", "Billing A", "Refunds return within 7 days.");
    await addDoc(projectB, "billing", "Billing B", "Refunds return within 9 days.");
    await syncWikiFromDocuments(projectA);
    await syncWikiFromDocuments(projectB);
    await embedAll(alice, slugA);
    await embedAll(eve, slugB);
    const a = headings(await ask(projectA, asUser(bob)));
    expect(a).toContain("Billing A › Refunds");
    expect(a).not.toContain("Billing B › Refunds");
    const b = headings(await ask(projectB, asUser(eve, "owner")));
    expect(b).toContain("Billing B › Refunds");
    expect(b).not.toContain("Billing A › Refunds");
  });

  it.each(["private", "restricted"] as const)(
    "does not return a passage whose asset became %s after it was embedded",
    async (visibility) => {
      await addDoc(projectA, "billing", "Billing", "Refunds return within 7 days.");
      await syncWikiFromDocuments(projectA);
      await embedAll(alice, slugA);
      expect(headings(await ask(projectA, asUser(bob)))).toContain("Billing › Refunds");
      const assetIds = (
        await db
          .select({ id: wikiSources.assetId })
          .from(wikiSources)
          .where(eq(wikiSources.projectId, projectA))
      ).map((r) => r.id);
      for (const id of assetIds)
        await db.update(memoryAssets).set({ visibility }).where(eq(memoryAssets.id, id));
      expect(headings(await ask(projectA, asUser(bob)))).not.toContain("Billing › Refunds");
    },
  );
});
