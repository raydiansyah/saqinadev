import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";
import { deliver } from "@/lib/notifications/service";
import { createUser, resetDatabase } from "../helpers/db";

/** Captures what would go to Resend: subject, html lang and recipient of each message. */
function captureMail() {
  const sent: { to: string; subject: string; html: string }[] = [];
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Saqina <no-reply@saqina.test>");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ id: "x" });
    }),
  );
  return sent;
}

describe("email language follows the site language", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the verification mail in Indonesian when sign-up happened under /id", async () => {
    const sent = captureMail();
    await auth.api.signUpEmail({
      body: {
        name: "Budi",
        email: "budi@example.test",
        password: "Saqina#2026",
        callbackURL: "/id/dashboard",
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Verifikasi email Saqina Dev Anda");
    expect(sent[0].html).toContain('lang="id"');
    const [user] = await db.select().from(users).where(eq(users.email, "budi@example.test"));
    expect(user.locale).toBe("id");
  });

  it("sends English when sign-up happened under /en", async () => {
    const sent = captureMail();
    await auth.api.signUpEmail({
      body: {
        name: "Sam",
        email: "sam@example.test",
        password: "Saqina#2026",
        callbackURL: "/en/dashboard",
      },
    });
    expect(sent[0].subject).toBe("Verify your Saqina Dev email");
    const [user] = await db.select().from(users).where(eq(users.email, "sam@example.test"));
    expect(user.locale).toBe("en");
  });

  it("delivers notifications in each recipient's stored language", async () => {
    const sent = captureMail();
    const indonesian = await createUser("Dewi", "dewi@example.test");
    const english = await createUser("Sam", "sam2@example.test");
    const defaulted = await createUser("Lee", "lee@example.test");
    await db.update(users).set({ locale: "id" }).where(eq(users.id, indonesian.id));
    await db.update(users).set({ locale: "en" }).where(eq(users.id, english.id));

    const rows = await db
      .insert(notifications)
      .values(
        [indonesian, english, defaulted].map((u) => ({
          userId: u.id,
          type: "invoice.issued",
          params: { number: "INV-1" },
          href: "/portal",
          dedupKey: `k-${u.id}`,
        })),
      )
      .returning({ id: notifications.id });
    await deliver({ ids: rows.map((r) => r.id), email: true });

    const subjectFor = (email: string) => sent.find((m) => m.to === email)?.subject;
    expect(subjectFor("dewi@example.test")).toBe("Saqina Dev: Invoice baru");
    expect(subjectFor("sam2@example.test")).toBe("Saqina Dev: New invoice");
    expect(subjectFor("lee@example.test")).toBe("Saqina Dev: New invoice");
  });
});
