import { sql } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/** Guard: integration tests must never run against the development database. */
export function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("_test")) throw new Error(`Refusing to run integration tests against ${url}`);
}

export async function resetDatabase() {
  assertTestDatabase();
  await db.execute(sql`
    truncate table users, projects cascade
  `);
}

let counter = 0;

export async function createUser(name = "Test User"): Promise<Actor> {
  counter += 1;
  const id = `user_${Date.now()}_${counter}`;
  const email = `${id}@example.test`;
  await db.insert(users).values({ id, name, email, emailVerified: true });
  return { id, name, email, image: null };
}
