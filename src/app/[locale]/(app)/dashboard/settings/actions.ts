"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { setUiMode } from "@/lib/users/preferences";

export async function setUiModeAction(input: unknown) {
  return runAction("user.uiMode", {}, async () => {
    await setUiMode(await requireActor(), input);
    // Navigation lives in layouts, so refresh the whole signed-in area.
    revalidatePath("/[locale]", "layout");
  });
}
