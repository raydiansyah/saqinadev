import "server-only";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import type { ProjectAccess, ProjectAction } from "@/lib/auth/permissions";
import { requireProjectAccess } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { isAppError } from "@/lib/errors";
import { loadSnapshot } from "./repository";

/**
 * Page-level access: missing or foreign projects render the 404 page (existence is never
 * revealed), an expired session goes back to sign-in.
 */
export async function projectPageAccess(
  slug: string,
  action: ProjectAction = "project:read",
): Promise<ProjectAccess> {
  try {
    return await requireProjectAccess(slug, action);
  } catch (error) {
    if (isAppError(error) && error.code === "AUTHENTICATION_ERROR") {
      const locale = await getLocale();
      return redirect({
        href: {
          pathname: "/sign-in",
          query: { reason: "expired", next: `/${locale}/project/${slug}` },
        },
        locale,
      });
    }
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "AUTHORIZATION_ERROR"))
      notFound();
    throw error;
  }
}

/** Snapshot for the header and overview, read once per request. */
export const projectSnapshot = cache(async (slug: string) => {
  const { project } = await projectPageAccess(slug);
  return loadSnapshot(db, project);
});
