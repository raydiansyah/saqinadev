import "server-only";
import { and, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import type { Executor } from "@/lib/db/client";
import { memories, memoryAcl, memoryAssets } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { type AclGrant, canManage, canRead, type Principal } from "./policy";

/** The requester as the memory layer sees it. */
export const principalOf = (access: ProjectAccess): Principal => ({
  kind: "user",
  userId: access.actor.id,
  role: access.role,
});

export type LoadedAsset = {
  asset: typeof memoryAssets.$inferSelect;
  memory: typeof memories.$inferSelect;
  acl: AclGrant[];
  principal: Principal;
};

/**
 * Loads one chat asset of the project for the requester. An asset the requester may not read is
 * reported as NOT_FOUND, exactly like a project they are not a member of.
 */
export async function loadAsset(
  executor: Executor,
  access: ProjectAccess,
  assetId: string,
  /** Inside a write: lock the asset row so a concurrent approve, reject or delete waits. */
  options: { lock?: boolean } = {},
): Promise<LoadedAsset> {
  const principal = principalOf(access);
  const query = executor
    .select({ asset: memoryAssets, memory: memories })
    .from(memoryAssets)
    .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
    .where(and(eq(memoryAssets.id, assetId), eq(memoryAssets.projectId, access.project.id)));
  const [row] = await (options.lock ? query.for("update", { of: memoryAssets }) : query);
  if (!row) throw new AppError("NOT_FOUND");
  const acl = await executor.select().from(memoryAcl).where(eq(memoryAcl.assetId, assetId));
  if (!canRead(principal, row.asset, acl)) throw new AppError("NOT_FOUND");
  return { ...row, acl, principal };
}

/** Throws AUTHORIZATION_ERROR when the requester can read the asset but not change it. */
export function requireManage(loaded: LoadedAsset): void {
  if (!canManage(loaded.principal, loaded.asset, loaded.acl)) {
    throw new AppError("AUTHORIZATION_ERROR");
  }
}

/** Activity feed and context revision only move for what the whole project can see. */
export const isSharedContext = (a: { status: string; visibility: string }) =>
  a.status === "approved" && a.visibility === "project";

export type LoadedBase = Omit<LoadedAsset, "memory">;

/**
 * Loads any asset of the project (chat, wiki, skill) for the requester, with the same rule as
 * `loadAsset`: unreadable is NOT_FOUND. Use it for what does not depend on the payload.
 */
export async function loadAnyAsset(
  executor: Executor,
  access: ProjectAccess,
  assetId: string,
  options: { lock?: boolean } = {},
): Promise<LoadedBase> {
  const principal = principalOf(access);
  const query = executor
    .select()
    .from(memoryAssets)
    .where(and(eq(memoryAssets.id, assetId), eq(memoryAssets.projectId, access.project.id)));
  const [asset] = await (options.lock ? query.for("update") : query);
  if (!asset) throw new AppError("NOT_FOUND");
  const acl = await executor.select().from(memoryAcl).where(eq(memoryAcl.assetId, assetId));
  if (!canRead(principal, asset, acl)) throw new AppError("NOT_FOUND");
  return { asset, acl, principal };
}

export function requireManageBase(loaded: LoadedBase): void {
  if (!canManage(loaded.principal, loaded.asset, loaded.acl)) {
    throw new AppError("AUTHORIZATION_ERROR");
  }
}
