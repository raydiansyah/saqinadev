"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { syncRequirementsFromDocs } from "@/lib/imports/sync";
import {
  bulkDeleteRequirements,
  bulkUpdateRequirements,
  createRequirement,
  deleteRequirement,
  updateRequirement,
} from "@/lib/requirements/service";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createRequirementAction(slug: string, input: unknown) {
  return runAction("requirement.create", { slug }, async () => {
    await createRequirement(await requireActor(), slug, input);
    refresh();
  });
}

export async function updateRequirementAction(slug: string, input: unknown) {
  return runAction("requirement.update", { slug }, async () => {
    await updateRequirement(await requireActor(), slug, input);
    refresh();
  });
}

export async function deleteRequirementAction(slug: string, id: string) {
  return runAction("requirement.delete", { slug }, async () => {
    await deleteRequirement(await requireActor(), slug, { id });
    refresh();
  });
}

/** Reads the repository documents again and adds the requirements the project does not have. */
export async function syncRequirementsAction(slug: string, useAi: boolean, locale: string) {
  return runAction("requirement.sync_docs", { slug }, async () => {
    const result = await syncRequirementsFromDocs(
      await requireActor(),
      slug,
      { useAi },
      isLocale(locale) ? locale : DEFAULT_LOCALE,
    );
    if (result.added > 0) refresh();
    return result;
  });
}

/** One status, priority or group for every selected requirement. */
export async function bulkUpdateRequirementsAction(slug: string, input: unknown) {
  return runAction("requirement.bulk_update", { slug }, async () => {
    const result = await bulkUpdateRequirements(await requireActor(), slug, input);
    refresh();
    return result;
  });
}

export async function bulkDeleteRequirementsAction(slug: string, input: unknown) {
  return runAction("requirement.bulk_delete", { slug }, async () => {
    const result = await bulkDeleteRequirements(await requireActor(), slug, input);
    refresh();
    return result;
  });
}
