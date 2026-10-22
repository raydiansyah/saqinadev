import type { MemberRole } from "@/lib/domain/enums";
import { type AssetStatus, REVIEW_STATUSES, type Visibility } from "@/lib/domain/memory";

/**
 * Who is asking. Project access is already established by the caller (`loadProjectAccess` or
 * `verifyAgentToken`); this layer decides what that requester may see *inside* the project.
 * An agent never inherits its creator's private memory, whatever the database allows.
 */
export type Principal =
  | { kind: "user"; userId: string; role: MemberRole }
  | { kind: "agent"; agentId: string; creatorId: string; canReadMemory: boolean };

/** The fields of an asset that authorization needs. */
export interface AssetAccessFacts {
  ownerId: string | null;
  visibility: Visibility;
  status: AssetStatus;
}

export interface AclGrant {
  principalType: "user" | "agent";
  principalId: string;
  permission: "read" | "manage";
}

const isAdmin = (p: Principal) => p.kind === "user" && (p.role === "owner" || p.role === "admin");
const isOwner = (p: Principal, a: AssetAccessFacts) =>
  p.kind === "user" && a.ownerId !== null && a.ownerId === p.userId;

function grantFor(p: Principal, acl: readonly AclGrant[]): AclGrant | undefined {
  const id = p.kind === "user" ? p.userId : p.agentId;
  return acl.find((g) => g.principalType === p.kind && g.principalId === id);
}

/** True when the asset is in a state that retrieval and context assembly may use. */
export function isRetrievable(status: AssetStatus, validUntil: Date | null, now = new Date()) {
  return status === "approved" && (validUntil === null || validUntil > now);
}

/**
 * Object-level read check, used on detail pages and again before content is returned. The same
 * rules exist as SQL in `visibleWhere`; a test keeps the two in step.
 */
export function canRead(
  principal: Principal,
  asset: AssetAccessFacts,
  acl: readonly AclGrant[] = [],
): boolean {
  if (principal.kind === "agent" && !principal.canReadMemory) return false;

  // Unreviewed and retired assets are for the people who manage them, never for agents.
  if (asset.status !== "approved") {
    if (principal.kind === "agent") return false;
    const reviewing = REVIEW_STATUSES.includes(asset.status as (typeof REVIEW_STATUSES)[number]);
    if (isOwner(principal, asset)) return true;
    // Admins review what is headed for the whole project; restricted or private stays with its owner.
    return reviewing && asset.visibility === "project" && isAdmin(principal);
  }

  switch (asset.visibility) {
    case "private":
      return isOwner(principal, asset);
    case "project":
      return true;
    case "restricted":
    case "agent": {
      if (principal.kind === "user" && isOwner(principal, asset)) return true;
      return grantFor(principal, acl) !== undefined;
    }
    // Organization-wide assets have no project and no UI yet; nothing grants them by accident.
    default:
      return false;
  }
}

/** Edit, share, archive, delete. Private assets stay with their owner; admins cannot reach them. */
export function canManage(
  principal: Principal,
  asset: AssetAccessFacts,
  acl: readonly AclGrant[] = [],
): boolean {
  if (principal.kind !== "user") return false;
  if (principal.role === "viewer") return false;
  if (isOwner(principal, asset)) return true;
  if (asset.visibility === "private") return false;
  return isAdmin(principal) || grantFor(principal, acl)?.permission === "manage";
}
