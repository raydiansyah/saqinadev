/**
 * Creates (or promotes) the default platform Owner account for a fresh install. Safe to re-run.
 *
 *   OWNER_EMAIL     required (falls back to the first PLATFORM_OWNER_EMAILS entry)
 *   OWNER_NAME      optional, defaults to "Saqina Owner"
 *   OWNER_PASSWORD  optional, 12+ characters. When unset, a strong one is generated and printed
 *                   once. Keep this out of the hosting dashboard: it is only read by this script.
 *
 * The account is created verified (no email is sent) and an existing account keeps its password.
 * Run against Neon by exporting its direct DATABASE_URL for the one command, see the README
 * note in .env.example.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "../src/lib/auth/config";
import { passwordIssue } from "../src/lib/auth/password-policy";
import { db } from "../src/lib/db/client";
import { accounts, users } from "../src/lib/db/schema";
import { ensurePersonalOrg } from "../src/lib/organizations/service";

const MIN_PASSWORD = 12;

function fail(message: string): never {
  console.error(`create-owner: ${message}`);
  process.exit(1);
}

function resolveEmail(): string {
  const fromList = (process.env.PLATFORM_OWNER_EMAILS ?? "").split(",")[0];
  const email = (process.env.OWNER_EMAIL || fromList || "").trim().toLowerCase();
  if (!email) fail("set OWNER_EMAIL (or PLATFORM_OWNER_EMAILS) in the environment");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("OWNER_EMAIL is not a valid email");
  return email;
}

async function main() {
  const email = resolveEmail();
  const name = (process.env.OWNER_NAME ?? "").trim() || "Saqina Owner";
  const supplied = process.env.OWNER_PASSWORD;
  if (supplied && (supplied.length < MIN_PASSWORD || passwordIssue(supplied)))
    fail(`OWNER_PASSWORD needs ${MIN_PASSWORD}+ characters with a number and a symbol`);

  const target = new URL(process.env.DATABASE_URL ?? fail("DATABASE_URL is not set"));
  console.log(`Database: ${target.host}${target.pathname}`);

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db
      .update(users)
      .set({ platformRole: "owner", emailVerified: true })
      .where(eq(users.id, existing.id));
    console.log(`Account ${email} already exists: now a platform owner. Password unchanged.`);
    return;
  }

  const password = supplied || `${randomBytes(18).toString("base64url")}-7!`;
  // Better Auth's own hasher, so the account signs in like any other. Written straight to the
  // tables (no sign-up call) so no verification email goes out; the personal organization the
  // sign-up hook would create is ensured explicitly.
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(password);
  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: userId, email, name, emailVerified: true, platformRole: "owner" });
    await tx.insert(accounts).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    });
    await ensurePersonalOrg(userId, tx);
  });

  console.log(`Owner created: ${email}`);
  if (!supplied) {
    console.log(`Password (shown once, change it after signing in): ${password}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
