import "server-only";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { AppError } from "@/lib/errors";
import type { Actor } from "./actor";
import { auth } from "./config";
import { loadProjectAccess, type ProjectAccess, type ProjectAction } from "./permissions";

export type { Actor };

/** Reads and validates the session once per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
});

/** For pages and layouts: sends signed-out visitors to sign-in and back afterwards. */
export async function requireActorPage(returnTo: string): Promise<Actor> {
  const actor = await getActor();
  if (actor) return actor;
  const locale = await getLocale();
  return redirect({ href: { pathname: "/sign-in", query: { next: returnTo } }, locale });
}

/** For server actions and services: fails with a typed error instead of redirecting. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError("AUTHENTICATION_ERROR");
  return actor;
}

export async function signOutServer(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
}

/** Session + membership + permission for the current request. Cached per request. */
export const requireProjectAccess = cache(
  async (slug: string, action: ProjectAction = "project:read"): Promise<ProjectAccess> => {
    const actor = await requireActor();
    return loadProjectAccess(actor, { slug }, action);
  },
);
