import "server-only";
import { eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { recommendations } from "@/lib/db/schema";
import { RECOMMENDATION_KEYS } from "@/lib/domain/enums";

export type StoredRecommendation = typeof recommendations.$inferSelect;

export async function listRecommendations(access: ProjectAccess): Promise<StoredRecommendation[]> {
  const rows = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.projectId, access.project.id));
  return rows.sort(
    (a, b) => RECOMMENDATION_KEYS.indexOf(a.key) - RECOMMENDATION_KEYS.indexOf(b.key),
  );
}
