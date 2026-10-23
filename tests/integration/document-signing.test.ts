import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { acceptInvitation, createInvitation } from "@/lib/clients/invitations";
import { createClient, setProjectClient } from "@/lib/clients/service";
import { db } from "@/lib/db/client";
import { documentSignatures, documents, notifications, projectMembers } from "@/lib/db/schema";
import { generateBusinessDocument } from "@/lib/documents/business";
import { saveDocument, setDocumentClientVisible, setDocumentStatus } from "@/lib/documents/service";
import {
  getSigningState,
  requestChangesAsClient,
  signAsClient,
  signAsTeam,
} from "@/lib/documents/signing";
import { AppError } from "@/lib/errors";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

let owner: Actor;
let viewer: Actor;
let client: Actor;
let stranger: Actor;
let slug: string;
let projectId: string;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};
const doc = async (docSlug = "agreement") =>
  (await db.select().from(documents).where(eq(documents.slug, docSlug)))[0];
const state = async (docSlug = "agreement") => getSigningState(db, await doc(docSlug));

/** A drafted agreement that the team approved and shared with the client. */
async function readyAgreement(docSlug = "agreement", kind: "agreement" | "proposal" = "agreement") {
  await generateBusinessDocument(owner, slug, { kind }, "en");
  await setDocumentStatus(owner, slug, { docSlug, status: "approved" });
  await setDocumentClientVisible(owner, slug, { docSlug, visible: true });
}

beforeEach(async () => {
  await resetDatabase();
  owner = await createUser("Owner", "owner@example.test");
  viewer = await createUser("Viewer", "viewer@example.test");
  stranger = await createUser("Stranger", "stranger@example.test");
  slug = await project(owner, "A restaurant point of sale app for my cafe with stock.");
  projectId = (await loadProjectAccess(owner, { slug }, "project:read")).project.id;
  await db.insert(projectMembers).values({ projectId, userId: viewer.id, role: "viewer" });
  const c = await createClient(owner, { name: "PT ABC", email: "budi@example.test" });
  await setProjectClient(owner, slug, { clientId: c.id, portalEnabled: true, currency: "IDR" });
  const { url } = await createInvitation(owner, c.id, { email: "budi@example.test" });
  client = await createUser("Budi", "budi@example.test");
  await acceptInvitation(client, url.split("/invite/")[1]);
});

describe("two-party signing", () => {
  it("issues a reference number only after both parties signed the approved text", async () => {
    await readyAgreement();
    expect((await state()).reference).toBeNull();

    const first = await signAsTeam(owner, slug, "agreement");
    expect(first).toEqual({ issued: false, reference: null });
    expect((await doc()).status).toBe("approved");
    expect((await state()).signatures.map((s) => s.party)).toEqual(["team"]);

    const second = await signAsClient(client, slug, "agreement");
    expect(second.issued).toBe(true);
    expect(second.reference).toMatch(/^AGR-\d{4}-001$/);
    const done = await doc();
    expect(done).toMatchObject({ status: "signed", clientVisible: true });
    expect(done.reference).toBe(second.reference);
    expect(done.issuedAt).toBeInstanceOf(Date);
  });

  it("works in either order, and numbers each kind on its own", async () => {
    await readyAgreement();
    await signAsClient(client, slug, "agreement");
    const issued = await signAsTeam(owner, slug, "agreement");
    expect(issued.reference).toMatch(/^AGR-\d{4}-001$/);

    await readyAgreement("proposal", "proposal");
    await signAsTeam(owner, slug, "proposal");
    const proposal = await signAsClient(client, slug, "proposal");
    expect(proposal.reference).toMatch(/^PRP-\d{4}-001$/);
  });

  it("will not sign before the text is approved, or twice, or after issue", async () => {
    await generateBusinessDocument(owner, slug, { kind: "agreement" }, "en");
    expect(await code(signAsTeam(owner, slug, "agreement"))).toBe("CONFLICT");
    await setDocumentStatus(owner, slug, { docSlug: "agreement", status: "approved" });
    await setDocumentClientVisible(owner, slug, { docSlug: "agreement", visible: true });
    await signAsTeam(owner, slug, "agreement");
    expect(await code(signAsTeam(owner, slug, "agreement"))).toBe("CONFLICT");
    await signAsClient(client, slug, "agreement");
    expect(await code(signAsClient(client, slug, "agreement"))).toBe("CONFLICT");
  });

  it("is not a single click: the plain status change refuses 'signed' for these documents", async () => {
    await readyAgreement();
    expect(
      await code(setDocumentStatus(owner, slug, { docSlug: "agreement", status: "signed" })),
    ).toBe("VALIDATION_ERROR");
    expect((await doc()).status).toBe("approved");
  });

  it("removes the signatures when the text changes or the approval is taken back", async () => {
    await readyAgreement();
    await signAsTeam(owner, slug, "agreement");
    expect((await state()).signatures).toHaveLength(1);
    const d = await doc();
    await saveDocument(owner, slug, {
      docSlug: "agreement",
      content: `${d.content}\n\nAn extra clause.`,
      baseVersion: d.version,
    });
    expect(await db.select().from(documentSignatures)).toHaveLength(0);
    expect((await doc()).status).not.toBe("signed");

    await setDocumentStatus(owner, slug, { docSlug: "agreement", status: "approved" });
    await signAsTeam(owner, slug, "agreement");
    await setDocumentStatus(owner, slug, { docSlug: "agreement", status: "draft" });
    expect(await db.select().from(documentSignatures)).toHaveLength(0);
  });

  it("a signed document stays read-only and cannot be regenerated", async () => {
    await readyAgreement();
    await signAsTeam(owner, slug, "agreement");
    await signAsClient(client, slug, "agreement");
    const d = await doc();
    expect(
      await code(
        saveDocument(owner, slug, {
          docSlug: "agreement",
          content: "changed",
          baseVersion: d.version,
        }),
      ),
    ).toBe("CONFLICT");
    expect(await code(generateBusinessDocument(owner, slug, { kind: "agreement" }, "en"))).toBe(
      "CONFLICT",
    );
  });

  it("lets the client ask for changes: back to review, off the portal, signatures gone", async () => {
    await readyAgreement();
    await signAsTeam(owner, slug, "agreement");
    await requestChangesAsClient(client, slug, "agreement", {
      note: "The payment dates are wrong.",
    });
    expect(await doc()).toMatchObject({ status: "review", clientVisible: false });
    expect(await db.select().from(documentSignatures)).toHaveLength(0);
    const team = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(team.some((n) => n.type === "document.changes_requested")).toBe(true);
    expect(await code(requestChangesAsClient(client, slug, "agreement", { note: "no" }))).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("keeps the doors closed: viewers, strangers, and a client before the document is shared", async () => {
    await generateBusinessDocument(owner, slug, { kind: "agreement" }, "en");
    await setDocumentStatus(owner, slug, { docSlug: "agreement", status: "approved" });
    // Approved but not shared: the client cannot see it, so cannot sign it.
    expect(await code(signAsClient(client, slug, "agreement"))).toBe("NOT_FOUND");
    await setDocumentClientVisible(owner, slug, { docSlug: "agreement", visible: true });
    expect(await code(signAsTeam(viewer, slug, "agreement"))).toBe("AUTHORIZATION_ERROR");
    expect(await code(signAsTeam(stranger, slug, "agreement"))).toBe("NOT_FOUND");
    expect(await code(signAsClient(stranger, slug, "agreement"))).toBe("NOT_FOUND");
    // A team member is not a client, and a client is not on the team.
    expect(await code(signAsClient(owner, slug, "agreement"))).toBe("NOT_FOUND");
    expect(await code(signAsTeam(client, slug, "agreement"))).toBe("NOT_FOUND");
  });

  it("only signs the documents two parties sign", async () => {
    expect(await code(signAsTeam(owner, slug, "prd"))).toBe("VALIDATION_ERROR");
  });
});
