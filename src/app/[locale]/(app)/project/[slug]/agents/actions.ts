"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { setPreferredAgent, updateAgentConfiguration } from "@/lib/agents/service";
import { requireActor } from "@/lib/auth/server";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function setPreferredAgentAction(slug: string, input: unknown) {
  return runAction("agent.prefer", { slug }, async () => {
    await setPreferredAgent(await requireActor(), slug, input);
    refresh();
  });
}

export async function configureAgentAction(slug: string, input: unknown) {
  return runAction("agent.configure", { slug }, async () => {
    await updateAgentConfiguration(await requireActor(), slug, input);
    refresh();
  });
}
