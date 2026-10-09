import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { UI_MODES, type UiMode } from "@/lib/domain/business";
import { parse } from "@/lib/validation";

/** Navigation density for this user. Presentation only; never used for authorization. */
export async function getUiMode(actor: Actor): Promise<UiMode> {
  const [row] = await db
    .select({ uiMode: users.uiMode })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  return row?.uiMode ?? "simple";
}

export async function setUiMode(actor: Actor, input: unknown): Promise<void> {
  const { mode } = parse(z.object({ mode: z.enum(UI_MODES) }), input);
  await db.update(users).set({ uiMode: mode }).where(eq(users.id, actor.id));
}
