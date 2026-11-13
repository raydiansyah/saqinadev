import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { createInvoice, transitionInvoice } from "@/lib/billing/invoices";
import { recordPayment } from "@/lib/billing/payments";
import { db } from "@/lib/db/client";
import { documents, invoices, meetingNotes, payments, projectMembers } from "@/lib/db/schema";
import { createDocument, saveDocument, setDocumentStatus } from "@/lib/documents/service";
import { AppError } from "@/lib/errors";
import { teamCreateNote, teamUpdateNote } from "@/lib/meetings/notes";
import { createUser, resetDatabase } from "../helpers/db";
import { project } from "../helpers/project";

/**
 * Insecure direct object reference matrix: an id from project A, used through project B's slug or by
 * someone who is not a member, must never read or change anything. The first request in each pair
 * changes the id (the /invoice/123 to /invoice/124 move); the second changes the person.
 */

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

let alice: Actor; // owns project A
let bob: Actor; // owns project B
let viewer: Actor; // read-only member of A
let signedOut: Actor; // an actor that exists but is a member of nothing
let slugA: string;
let slugB: string;
let ids: { invoice: string; payment: string; doc: string; note: string };

const snapshot = async () => ({
  invoices: await db.select().from(invoices),
  payments: await db.select().from(payments),
  documents: await db.select().from(documents),
  notes: await db.select().from(meetingNotes),
});

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser("Alice");
  bob = await createUser("Bob");
  viewer = await createUser("Viewer");
  signedOut = await createUser("Nobody");
  slugA = await project(alice, "Bakery web shop");
  slugB = await project(bob, "Recipe sharing app");
  const a = await loadProjectAccess(alice, { slug: slugA }, "project:read");
  await db
    .insert(projectMembers)
    .values({ projectId: a.project.id, userId: viewer.id, role: "viewer" });

  const invoice = await createInvoice(alice, slugA, {
    title: "Secret invoice of A",
    items: [{ description: "Work", quantity: 1, unitAmount: 1_000_000 }],
  });
  await transitionInvoice(alice, slugA, invoice.id, "issue");
  await recordPayment(alice, slugA, invoice.id, {
    amount: 100_000,
    paidAt: "2026-10-01",
    method: "bank_transfer",
    reference: "A-1",
  });
  const [payment] = await db.select().from(payments);
  const doc = await createDocument(alice, slugA, { title: "Secret document of A" });
  const note = await teamCreateNote(alice, slugA, {
    title: "Secret meeting of A",
    meetingDate: "2026-10-12",
    body: "Private notes about the deal.",
  });
  ids = { invoice: invoice.id, payment: payment.id, doc: doc.slug, note: note.id };
});

describe("an id from another project", () => {
  it("cannot be changed through the owner's own project slug", async () => {
    const before = await snapshot();
    expect(await code(transitionInvoice(bob, slugB, ids.invoice, "send"))).toBe("NOT_FOUND");
    expect(await code(transitionInvoice(bob, slugB, ids.invoice, "cancel"))).toBe("NOT_FOUND");
    expect(
      await code(
        recordPayment(bob, slugB, ids.invoice, {
          amount: 1,
          paidAt: "2026-10-02",
          method: "cash",
          reference: "",
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await code(saveDocument(bob, slugB, { docSlug: ids.doc, content: "x", baseVersion: 1 })),
    ).toBe("NOT_FOUND");
    expect(
      await code(setDocumentStatus(bob, slugB, { docSlug: ids.doc, status: "approved" })),
    ).toBe("NOT_FOUND");
    expect(await code(teamUpdateNote(bob, slugB, ids.note, { title: "Hijack" }))).toBe("NOT_FOUND");
    expect(await snapshot()).toEqual(before);
  });
});

describe("a person who is not allowed", () => {
  it("a stranger learns nothing, even about the slug", async () => {
    const before = await snapshot();
    expect(await code(transitionInvoice(signedOut, slugA, ids.invoice, "cancel"))).toBe(
      "NOT_FOUND",
    );
    expect(
      await code(
        createInvoice(signedOut, slugA, {
          title: "Injected",
          items: [{ description: "x", quantity: 1, unitAmount: 1 }],
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await code(
        saveDocument(signedOut, slugA, { docSlug: ids.doc, content: "x", baseVersion: 1 }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await code(teamUpdateNote(signedOut, slugA, ids.note, { title: "Hijacked title" })),
    ).toBe("NOT_FOUND");
    expect(await snapshot()).toEqual(before);
  });

  it("a read-only member is refused, not told the project does not exist", async () => {
    const before = await snapshot();
    expect(await code(transitionInvoice(viewer, slugA, ids.invoice, "cancel"))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(
      await code(saveDocument(viewer, slugA, { docSlug: ids.doc, content: "x", baseVersion: 1 })),
    ).toBe("AUTHORIZATION_ERROR");
    expect(await code(teamUpdateNote(viewer, slugA, ids.note, { title: "Hijacked title" }))).toBe(
      "AUTHORIZATION_ERROR",
    );
    expect(await snapshot()).toEqual(before);
  });
});

describe("hostile text", () => {
  const PAYLOADS = [
    "'; DROP TABLE invoices; --",
    '" OR "1"="1',
    "%' OR title LIKE '%",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "${7*7}{{7*7}}",
    "\u0000\u0007control",
  ];

  it("is stored as plain data and nothing else changes", async () => {
    for (const payload of PAYLOADS) {
      const invoice = await createInvoice(alice, slugA, {
        title: `T ${payload}`.slice(0, 150),
        items: [{ description: payload.slice(0, 200) || "x", quantity: 1, unitAmount: 1000 }],
        notes: payload,
      });
      const [row] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
      // NUL cannot be stored; everything else is kept exactly.
      expect(row.notes).toBe(payload.replaceAll("\u0000", "").trim());
    }
    const rows = await db.select().from(invoices);
    expect(rows.some((r) => r.title === "Secret invoice of A")).toBe(true);
  });
});
