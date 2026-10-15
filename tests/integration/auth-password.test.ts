import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { resetDatabase } from "../helpers/db";

const signUp = (email: string, password: string) =>
  auth.api.signUpEmail({ body: { name: "Policy Tester", email, password } });

describe("password policy enforced by Better Auth", () => {
  beforeEach(resetDatabase);

  it("rejects weak passwords at sign-up and creates no account", async () => {
    for (const password of ["short1!", "longenoughbutplain", "NoSymbol12345", "No-numbers-here"]) {
      await expect(signUp("weak@example.test", password)).rejects.toMatchObject({
        body: { code: "PASSWORD_POLICY" },
      });
    }
    const rows = await db.select().from(users).where(eq(users.email, "weak@example.test"));
    expect(rows).toHaveLength(0);
  });

  it("accepts a password with 8+ characters, a number and a symbol", async () => {
    await signUp("strong@example.test", "Saqina#2026");
    const rows = await db.select().from(users).where(eq(users.email, "strong@example.test"));
    expect(rows).toHaveLength(1);
  });
});
