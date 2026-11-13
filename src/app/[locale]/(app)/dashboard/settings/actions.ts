"use server";

import { revalidatePath } from "next/cache";
import { deleteAccount } from "@/lib/account/delete";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { setRegistrationEnabled } from "@/lib/platform/settings";
import { removeLogo, saveBrand, saveLogo } from "@/lib/white-label/brand";
import { grantWhiteLabel, revokeWhiteLabel } from "@/lib/white-label/service";

export async function setRegistrationAction(input: unknown) {
  return runAction("platform.registration", {}, async () => {
    await setRegistrationEnabled(await requireActor(), input);
    // The sign-up page reads this switch on every request.
    revalidatePath("/[locale]/sign-up", "page");
  });
}

export async function deleteAccountAction(input: unknown) {
  return runAction("account.delete", {}, async () => {
    await deleteAccount(await requireActor(), input);
  });
}

/** The platform owner opens white label after a paid plan or a signed agreement. */
export async function grantWhiteLabelAction(input: unknown) {
  return runAction("whitelabel.grant", {}, async () => {
    await grantWhiteLabel(await requireActor(), input);
    revalidatePath("/[locale]/dashboard/settings/white-label", "page");
  });
}

export async function revokeWhiteLabelAction(input: unknown) {
  return runAction("whitelabel.revoke", {}, async () => {
    await revokeWhiteLabel(await requireActor(), input);
    revalidatePath("/[locale]/dashboard/settings/white-label", "page");
  });
}

export async function saveBrandAction(input: unknown) {
  return runAction("brand.save", {}, async () => {
    await saveBrand(await requireActor(), input);
    revalidatePath("/[locale]", "layout");
  });
}

export async function saveLogoAction(form: FormData) {
  return runAction("brand.logo", {}, async () => {
    const file = form.get("logo");
    // The type is read from the bytes in saveLogo; the browser's claim is not trusted.
    if (!(file instanceof File) || file.size === 0)
      throw new AppError("VALIDATION_ERROR", "No file", { logo: "whiteLabel.brand.logo.type" });
    await saveLogo(await requireActor(), new Uint8Array(await file.arrayBuffer()));
    revalidatePath("/[locale]", "layout");
  });
}

export async function removeLogoAction() {
  return runAction("brand.logo_remove", {}, async () => {
    await removeLogo(await requireActor());
    revalidatePath("/[locale]", "layout");
  });
}
