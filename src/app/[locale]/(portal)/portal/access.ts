import "server-only";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { getActor } from "@/lib/auth/server";
import { isAppError } from "@/lib/errors";
import { type ClientProjectAccess, loadClientProjectAccess } from "@/lib/portal/access";
import { clientProjectView } from "@/lib/portal/views";

/**
 * Page-level portal access: signed-out visitors go to sign-in and come back, projects the
 * user may not see render the 404 page (existence is never revealed). Cached per request.
 */
export const portalPageAccess = cache(async (slug: string): Promise<ClientProjectAccess> => {
  const locale = await getLocale();
  const actor = await getActor();
  if (!actor)
    return redirect({
      href: { pathname: "/sign-in", query: { next: `/${locale}/portal/projects/${slug}` } },
      locale,
    });
  try {
    return await loadClientProjectAccess(actor, slug);
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "AUTHORIZATION_ERROR"))
      notFound();
    throw error;
  }
});

/** The project read model, shared by the project layout and the overview page. */
export const portalProjectView = cache(async (slug: string) =>
  clientProjectView(await portalPageAccess(slug)),
);

/** Detail lookups (document, invoice) that miss render the 404 page. */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
