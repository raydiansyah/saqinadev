import "server-only";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { ProjectAccess, ProjectAction } from "@/lib/auth/permissions";
import { requireProjectAccess } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";

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
