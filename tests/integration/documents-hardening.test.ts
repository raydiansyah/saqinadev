import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, documentVersions, projects } from "@/lib/db/schema";
import {
  createDocument,
  saveDocument,
  saveDocumentTx,
  setDocumentClientVisible,
  setDocumentStatus,
} from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

const expectCode = async (promise: Promise<unknown>, code: AppError["code"]) => {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
};

describe("document writes", () => {
  let owner: Actor;
  let slug: string;
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("Owner", "owner@example.test");
    slug = await project(owner, "Restaurant point of sale");
    await createDocument(owner, slug, { title: "Notes" });
  });

  const prd = async () => {
    const [p] = await db.select().from(projects).where(eq(projects.slug, slug));
    const [d] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, p.id), eq(documents.slug, "notes")));
    return d;
  };

  it("refuses edits to signed and archived documents", async () => {
    const doc = await prd();
    for (const status of ["signed", "archived"] as const) {
      await setDocumentStatus(owner, slug, { docSlug: "notes", status });
      await expectCode(
        saveDocument(owner, slug, { docSlug: "notes", content: "new", baseVersion: doc.version }),
        "CONFLICT",
      );
    }
    expect((await prd()).content).toBe(doc.content);
  });

  it("withdraws approval and the client share when shared content changes", async () => {
    const doc = await prd();
    await setDocumentStatus(owner, slug, { docSlug: "notes", status: "approved" });
    await setDocumentClientVisible(owner, slug, { docSlug: "notes", visible: true });
    await saveDocument(owner, slug, {
      docSlug: "notes",
      content: `${doc.content}\n\nA new requirement.`,
      baseVersion: doc.version,
    });
    const after = await prd();
    expect(after.status).toBe("review");
    expect(after.clientVisible).toBe(false);
    expect(after.version).toBe(doc.version + 1);
  });

  it("keeps an approved document that was never shared approved", async () => {
    const doc = await prd();
    await setDocumentStatus(owner, slug, { docSlug: "notes", status: "approved" });
    await saveDocument(owner, slug, {
      docSlug: "notes",
      content: "edited",
      baseVersion: doc.version,
    });
    expect((await prd()).status).toBe("approved");
  });

  it("records where each version came from and skips identical content", async () => {
    const doc = await prd();
    const run = (content: string, baseVersion: number) =>
      db.transaction(async (tx) => {
        const access = await loadProjectAccess(owner, { slug }, "content:write", tx);
        return saveDocumentTx(tx, access, {
          docSlug: "notes",
          content,
          baseVersion,
          source: "sync",
        });
      });
    const first = await run("from the repository", doc.version);
    expect(first).toMatchObject({ changed: true, version: doc.version + 1 });
    const same = await run("from the repository", doc.version + 1);
    expect(same).toMatchObject({ changed: false, version: doc.version + 1 });
    const [row] = await db
      .select()
      .from(documentVersions)
      .where(
        and(eq(documentVersions.documentId, doc.id), eq(documentVersions.version, doc.version + 1)),
      );
    expect(row.source).toBe("sync");
    await expectCode(run("late", doc.version), "CONFLICT");
  });
});
