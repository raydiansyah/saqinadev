"use server";

import { isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createProject } from "@/lib/projects/service";

// Locale comes from the client: next/root-params is not available inside Server Actions.
export async function createProjectAction(input: {
  name: string;
  description?: string;
  clientId?: string | null;
  locale: string;
}) {
  return runAction("project.create", {}, async () => {
    const actor = await requireActor();
    const { locale, ...rest } = input;
    return createProject(actor, rest, isLocale(locale) ? locale : "en");
  });
}
