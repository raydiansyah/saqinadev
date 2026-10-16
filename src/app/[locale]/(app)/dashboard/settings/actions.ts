"use server";

import { revalidatePath } from "next/cache";
import { deleteAccount } from "@/lib/account/delete";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { setRegistrationEnabled } from "@/lib/platform/settings";
import { setUiMode } from "@/lib/users/preferences";

export async function setUiModeAction(input: unknown) {
  return runAction("user.uiMode", {}, async () => {
    await setUiMode(await requireActor(), input);
    // Navigation lives in layouts, so refresh the whole signed-in area.
    revalidatePath("/[locale]", "layout");
  });
}

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
