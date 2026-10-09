import "server-only";
import { notFound } from "next/navigation";
import type { Actor } from "@/lib/auth/actor";
import { isAppError } from "@/lib/errors";
import { type OrgAction, requireOrg } from "@/lib/organizations/service";

/** The active organization for an owner page; members without the permission get the 404 page. */
export async function orgPageAccess(actor: Actor, action: OrgAction) {
  try {
    return await requireOrg(actor, action);
  } catch (error) {
    if (isAppError(error) && error.code === "AUTHORIZATION_ERROR") notFound();
    throw error;
  }
}
