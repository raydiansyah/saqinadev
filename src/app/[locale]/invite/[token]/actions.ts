"use server";

import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { runAction } from "@/lib/actions";
import { requireActor, signOutServer } from "@/lib/auth/server";
import { acceptInvitation } from "@/lib/clients/invitations";

export async function acceptInvitationAction(token: string) {
  return runAction("invite.accept", {}, async () =>
    acceptInvitation(await requireActor(), String(token)),
  );
}

/** Signs out and returns to the same invitation so the right account can be used. */
export async function signOutForInviteAction(form: FormData) {
  await signOutServer();
  const value = String(form.get("locale") ?? "");
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  const token = String(form.get("token") ?? "");
  if (!/^[\w-]{20,100}$/.test(token)) return redirect({ href: "/", locale });
  return redirect({ href: `/invite/${token}`, locale });
}
