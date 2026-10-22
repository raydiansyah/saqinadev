import { and, eq, exists, gt, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memoryAcl, memoryAssets } from "@/lib/db/schema";
import { type AssetStatus, REVIEW_STATUSES } from "@/lib/domain/memory";
import type { Principal } from "./policy";

const aclFor = (principal: Principal) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(memoryAcl)
      .where(
        and(
          eq(memoryAcl.assetId, memoryAssets.id),
          eq(memoryAcl.principalType, principal.kind),
          eq(
            memoryAcl.principalId,
            principal.kind === "user" ? principal.userId : principal.agentId,
          ),
        ),
      ),
  );

/**
 * The authorization filter, applied inside the query so an unauthorized row is never read, ranked
 * or cached. Mirrors `canRead` in `policy.ts`. Always includes the project: nothing crosses it.
 */
export function visibleWhere(
  principal: Principal,
  projectId: string,
  statuses: readonly AssetStatus[] = ["approved"],
): SQL {
  const inProject = and(
    eq(memoryAssets.projectId, projectId),
    inArray(memoryAssets.status, [...statuses]),
  ) as SQL;

  if (principal.kind === "agent") {
    if (!principal.canReadMemory) return sql`false`;
    return and(
      inProject,
      eq(memoryAssets.status, "approved"),
      or(
        eq(memoryAssets.visibility, "project"),
        and(inArray(memoryAssets.visibility, ["restricted", "agent"]), aclFor(principal)),
      ),
    ) as SQL;
  }

  const mine = eq(memoryAssets.ownerId, principal.userId);
  const admin = principal.role === "owner" || principal.role === "admin";
  return and(
    inProject,
    or(
      and(eq(memoryAssets.visibility, "private"), mine),
      // Unreviewed assets of other visibilities are for the owner and for admins only.
      and(
        eq(memoryAssets.visibility, "project"),
        or(
          eq(memoryAssets.status, "approved"),
          mine,
          // Admins review what waits for a decision; archived or rejected stays with its owner.
          admin ? inArray(memoryAssets.status, [...REVIEW_STATUSES]) : sql`false`,
        ),
      ),
      and(
        inArray(memoryAssets.visibility, ["restricted", "agent"]),
        or(mine, and(eq(memoryAssets.status, "approved"), aclFor(principal))),
      ),
    ),
  ) as SQL;
}

/**
 * Approved assets one user may read, in any project. For lists that span projects (global search);
 * the caller still joins project membership. Same rules as `visibleWhere` for a user.
 */
export function approvedForUser(userId: string): SQL {
  const mine = eq(memoryAssets.ownerId, userId);
  const granted = exists(
    db
      .select({ one: sql`1` })
      .from(memoryAcl)
      .where(
        and(
          eq(memoryAcl.assetId, memoryAssets.id),
          eq(memoryAcl.principalType, "user"),
          eq(memoryAcl.principalId, userId),
        ),
      ),
  );
  return and(
    eq(memoryAssets.status, "approved"),
    or(
      eq(memoryAssets.visibility, "project"),
      and(eq(memoryAssets.visibility, "private"), mine),
      and(inArray(memoryAssets.visibility, ["restricted", "agent"]), or(mine, granted)),
    ),
  ) as SQL;
}

/** An asset whose validity window has not ended. No writer sets `valid_until` yet; readers honour it. */
export const notExpired = (): SQL =>
  or(isNull(memoryAssets.validUntil), gt(memoryAssets.validUntil, sql`now()`)) as SQL;
