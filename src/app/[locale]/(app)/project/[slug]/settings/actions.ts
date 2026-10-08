"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import {
  deleteProject,
  setProjectArchived,
  updateProjectGeneral,
  updateProjectSettings,
} from "@/lib/projects/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function updateGeneralAction(slug: string, input: unknown) {
  return runAction("project.update", { slug }, async () => {
    await updateProjectGeneral(await requireActor(), slug, input);
    refresh();
  });
}

export async function updateSettingsAction(slug: string, input: unknown) {
  return runAction("project.settings", { slug }, async () => {
    await updateProjectSettings(await requireActor(), slug, input);
    refresh();
  });
}

export async function setArchivedAction(slug: string, archived: boolean) {
  return runAction("project.archive", { slug, archived }, async () => {
    await setProjectArchived(await requireActor(), slug, archived);
    refresh();
  });
}

export async function deleteProjectAction(slug: string, confirmName: string, locale: string) {
  const result = await runAction("project.delete", { slug }, async () => {
    await deleteProject(await requireActor(), slug, confirmName);
  });
  if (!result.ok) return result;
  redirect({ href: "/dashboard/projects", locale: isLocale(locale) ? locale : DEFAULT_LOCALE });
  return result;
}
