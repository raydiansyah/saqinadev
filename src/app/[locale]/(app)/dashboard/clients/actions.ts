"use server";

import { revalidatePath } from "next/cache";
import { isLocale } from "@/i18n/locales";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import { createInvitation, revokeInvitation } from "@/lib/clients/invitations";
import { createClient, removePortalUser, updateClient } from "@/lib/clients/service";

const refresh = () => revalidatePath("/[locale]/dashboard/clients", "layout");

export async function createClientAction(input: unknown) {
  return runAction("client.create", {}, async () => {
    const result = await createClient(await requireActor(), input);
    refresh();
    return result;
  });
}

export async function updateClientAction(clientId: string, input: unknown) {
  return runAction("client.update", { clientId }, async () => {
    await updateClient(await requireActor(), clientId, input);
    refresh();
  });
}

export async function removePortalUserAction(clientId: string, userId: string) {
  return runAction("client.portalUser.remove", { clientId }, async () => {
    await removePortalUser(await requireActor(), clientId, userId);
    refresh();
  });
}

// Locale comes from the client: next/root-params is not available inside Server Actions.
export async function createInvitationAction(clientId: string, input: unknown, locale: string) {
  return runAction("client.invitation.create", { clientId }, async () => {
    const result = await createInvitation(
      await requireActor(),
      clientId,
      input,
      isLocale(locale) ? locale : "en",
    );
    refresh();
    return result;
  });
}

export async function revokeInvitationAction(clientId: string, invitationId: string) {
  return runAction("client.invitation.revoke", { clientId }, async () => {
    await revokeInvitation(await requireActor(), clientId, invitationId);
    refresh();
  });
}
