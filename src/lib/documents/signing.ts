import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import * as z from "zod";
import { recordActivity } from "@/lib/activity/service";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { db, type Executor, type Tx } from "@/lib/db/client";
import { documentSignatures, documents, orgCounters } from "@/lib/db/schema";
import type { DocumentStatus } from "@/lib/domain/enums";
import { clientParty, portalHref, teamHref } from "@/lib/engagement/shared";
import { AppError } from "@/lib/errors";
import {
  clientRecipients,
  deliver,
  notifyTx,
  type Pending,
  teamRecipients,
} from "@/lib/notifications/service";
import { parse } from "@/lib/validation";
import { documentReference, isSignable, referenceCounter, type SignableKind } from "./reference";

/**
 * Two-party signing of business documents. The team approves the text (status "approved");
 * then each party signs that exact version. Only when both have signed is the document issued:
 * it gets its reference number, becomes read-only and shows on the portal. Any change to the
 * text, or taking the approval back, removes the signatures so nobody has signed words they
 * did not see.
 */

export interface SigningState {
  /** A proposal, agreement, handover or maintenance agreement. */
  signable: boolean;
  status: DocumentStatus;
  version: number;
  reference: string | null;
  issuedAt: Date | null;
  /** Shared on the portal: the client can only sign what they can read. */
  clientVisible: boolean;
  /** Signatures on the current version. */
  signatures: { party: "team" | "client"; name: string; signedAt: Date }[];
}

export async function getSigningState(
  executor: Executor,
  doc: {
    id: string;
    type: string;
    status: DocumentStatus;
    version: number;
    reference: string | null;
    issuedAt: Date | null;
    clientVisible: boolean;
  },
): Promise<SigningState> {
  const signable = isSignable(doc.type);
  const rows = signable
    ? await executor
        .select({
          party: documentSignatures.party,
          name: documentSignatures.signerName,
          signedAt: documentSignatures.signedAt,
        })
        .from(documentSignatures)
        .where(
          and(
            eq(documentSignatures.documentId, doc.id),
            eq(documentSignatures.version, doc.version),
          ),
        )
    : [];
  return {
    signable,
    status: doc.status,
    version: doc.version,
    reference: doc.reference,
    issuedAt: doc.issuedAt,
    clientVisible: doc.clientVisible,
    signatures: rows,
  };
}

/** Removes the signatures a document had: its text or its approval changed. */
export async function clearSignatures(tx: Tx, documentId: string) {
  await tx.delete(documentSignatures).where(eq(documentSignatures.documentId, documentId));
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Next number for the organization, kind and year; atomic under concurrent signatures. */
async function allocate(tx: Tx, organizationId: string, kind: SignableKind, year: number) {
  const [row] = await tx
    .insert(orgCounters)
    .values({ organizationId, kind: referenceCounter(kind), year, next: 2 })
    .onConflictDoUpdate({
      target: [orgCounters.organizationId, orgCounters.kind, orgCounters.year],
      set: { next: sql`${orgCounters.next} + 1` },
    })
    .returning({ next: orgCounters.next });
  return documentReference(kind, year, row.next - 1);
}

type Project = Awaited<ReturnType<typeof loadProjectAccess>>["project"];

async function lockDocument(tx: Tx, projectId: string, docSlug: string) {
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.slug, docSlug)))
    .for("update");
  if (!doc) throw new AppError("NOT_FOUND");
  return doc;
}

async function signTx(
  tx: Tx,
  input: { project: Project; actor: Actor; docSlug: string; party: "team" | "client" },
): Promise<{ issued: boolean; reference: string | null; pending: Pending[] }> {
  const { project, actor, docSlug, party } = input;
  const doc = await lockDocument(tx, project.id, docSlug);
  // What the client cannot see does not exist for them.
  if (party === "client" && !doc.clientVisible) throw new AppError("NOT_FOUND");
  if (!isSignable(doc.type))
    throw new AppError("VALIDATION_ERROR", "This document is not signed by two parties", {
      docSlug: "documents.notSignable",
    });
  if (doc.status === "signed")
    throw new AppError("CONFLICT", "Already issued", { docSlug: "documents.alreadyIssued" });
  if (doc.status !== "approved")
    throw new AppError("CONFLICT", "Approve the document before signing", {
      docSlug: "documents.notApproved",
    });

  const inserted = await tx
    .insert(documentSignatures)
    .values({
      documentId: doc.id,
      version: doc.version,
      party,
      signerId: actor.id,
      signerName: actor.name,
      contentHash: sha256(doc.content),
    })
    .onConflictDoNothing()
    .returning({ id: documentSignatures.id });
  if (inserted.length === 0)
    throw new AppError("CONFLICT", "Already signed", { docSlug: "documents.alreadySigned" });

  const parties = await tx
    .select({ party: documentSignatures.party })
    .from(documentSignatures)
    .where(
      and(eq(documentSignatures.documentId, doc.id), eq(documentSignatures.version, doc.version)),
    );
  const both = new Set(parties.map((p) => p.party)).size === 2;
  const pending: Pending[] = [];

  if (!both) {
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.id,
      type: "document.signed",
      entityType: "document",
      entityId: doc.id,
      metadata: { slug: doc.slug, version: doc.version, party },
    });
    // The other side is the one who has to act now.
    pending.push(
      await notifyTx(tx, {
        userIds:
          party === "team"
            ? await clientRecipients(tx, project.id)
            : await teamRecipients(tx, project.id),
        projectId: project.id,
        type: "document.signed",
        params: { title: doc.title, project: project.name, party },
        href:
          party === "team"
            ? portalHref(project.slug, `/documents/${doc.slug}`)
            : teamHref(project.slug, `/documents/${doc.slug}`),
        dedupKey: `document:${doc.id}:${doc.version}:signed:${party}`,
        email: true,
      }),
    );
    return { issued: false, reference: null, pending };
  }

  const now = new Date();
  const reference = await allocate(tx, project.organizationId, doc.type, now.getFullYear());
  await tx
    .update(documents)
    .set({
      status: "signed",
      reference,
      issuedAt: now,
      // Both parties hold the same record: the client keeps seeing it.
      clientVisible: true,
      updatedBy: actor.id,
    })
    .where(eq(documents.id, doc.id));
  await recordActivity(tx, {
    projectId: project.id,
    actorId: actor.id,
    type: "document.issued",
    entityType: "document",
    entityId: doc.id,
    metadata: { slug: doc.slug, version: doc.version, reference },
  });
  const params = { title: doc.title, project: project.name, reference };
  pending.push(
    await notifyTx(tx, {
      userIds: await clientRecipients(tx, project.id),
      projectId: project.id,
      type: "document.issued",
      params,
      href: portalHref(project.slug, `/documents/${doc.slug}`),
      dedupKey: `document:${doc.id}:issued`,
      email: true,
    }),
    await notifyTx(tx, {
      userIds: await teamRecipients(tx, project.id),
      projectId: project.id,
      type: "document.issued",
      params,
      href: teamHref(project.slug, `/documents/${doc.slug}`),
      dedupKey: `document:${doc.id}:issued`,
      email: true,
    }),
  );
  return { issued: true, reference, pending };
}

/** The team signs the approved version. Needs the right to change the project. */
export async function signAsTeam(actor: Actor, slug: string, docSlug: string) {
  const { result, pending } = await db.transaction(async (tx) => {
    const { project } = await loadProjectAccess(actor, { slug }, "project:update", tx);
    const result = await signTx(tx, { project, actor, docSlug, party: "team" });
    return { result, pending: result.pending };
  });
  for (const p of pending) await deliver(p);
  return { issued: result.issued, reference: result.reference };
}

/** The client signs the approved, shared version, through the portal. */
export async function signAsClient(actor: Actor, slug: string, docSlug: string) {
  const party = await clientParty(actor, slug);
  const result = await db.transaction((tx) =>
    signTx(tx, { project: party.project, actor, docSlug, party: "client" }),
  );
  for (const p of result.pending) await deliver(p);
  return { issued: result.issued, reference: result.reference };
}

const changesInput = z.object({ note: z.string().trim().min(3).max(2000) });

/**
 * The client does not agree with the text. The document goes back to review, leaves the portal
 * and loses its signatures; the note tells the team what to change.
 */
export async function requestChangesAsClient(
  actor: Actor,
  slug: string,
  docSlug: string,
  input: unknown,
) {
  const { note } = parse(changesInput, input);
  const party = await clientParty(actor, slug);
  const pending = await db.transaction(async (tx) => {
    const doc = await lockDocument(tx, party.project.id, docSlug);
    if (!doc.clientVisible) throw new AppError("NOT_FOUND");
    if (!isSignable(doc.type) || doc.status !== "approved")
      throw new AppError("CONFLICT", "Nothing to change here", {
        docSlug: "documents.notApproved",
      });
    await tx
      .update(documents)
      .set({ status: "review", clientVisible: false })
      .where(eq(documents.id, doc.id));
    await clearSignatures(tx, doc.id);
    await recordActivity(tx, {
      projectId: party.project.id,
      actorId: actor.id,
      type: "document.changes_requested",
      entityType: "document",
      entityId: doc.id,
      // The note is the client's words: kept short, never logged elsewhere.
      metadata: { slug: doc.slug, note: note.slice(0, 500) },
    });
    return notifyTx(tx, {
      userIds: await teamRecipients(tx, party.project.id),
      projectId: party.project.id,
      type: "document.changes_requested",
      params: { title: doc.title, project: party.project.name },
      href: teamHref(party.project.slug, `/documents/${doc.slug}`),
      dedupKey: `document:${doc.id}:${doc.version}:changes`,
      email: true,
    });
  });
  await deliver(pending);
}

/** What the browser needs: dates as text, nothing else. */
export interface SigningView {
  signable: boolean;
  status: DocumentStatus;
  reference: string | null;
  issuedAt: string | null;
  clientVisible: boolean;
  signatures: { party: "team" | "client"; name: string; signedAt: string }[];
}

export const toSigningView = (state: SigningState): SigningView => ({
  signable: state.signable,
  status: state.status,
  reference: state.reference,
  issuedAt: state.issuedAt ? state.issuedAt.toISOString() : null,
  clientVisible: state.clientVisible,
  signatures: state.signatures.map((s) => ({ ...s, signedAt: s.signedAt.toISOString() })),
});
