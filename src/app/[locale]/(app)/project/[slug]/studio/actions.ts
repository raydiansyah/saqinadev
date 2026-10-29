"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor, requireProjectAccess } from "@/lib/auth/server";
import {
  publish,
  refreshDeployments,
  removeDeployTarget,
  setupDeployTarget,
} from "@/lib/deploy/service";
import { listCode, readCode } from "@/lib/studio/code";
import { startBuilding } from "@/lib/studio/kickoff";

/** "Start building": hands open tasks to the team agents when Saqina builds the project. */
export async function startBuildingAction(slug: string) {
  return runAction("studio.start", { slug }, async () => {
    const result = await startBuilding(await requireActor(), slug);
    revalidatePath("/[locale]/project/[slug]", "layout");
    return result;
  });
}

/** One folder of the repository (read only). */
export async function listCodeAction(slug: string, path: string) {
  return runAction("studio.code.list", { slug }, async () =>
    listCode(await requireProjectAccess(slug), path),
  );
}

/** One file of the repository (read only, capped, secrets masked). */
export async function readCodeAction(slug: string, path: string) {
  return runAction("studio.code.read", { slug }, async () =>
    readCode(await requireProjectAccess(slug), path),
  );
}

export async function setupDeployAction(slug: string, input: unknown) {
  return runAction("studio.deploy.setup", { slug }, async () => {
    await setupDeployTarget(await requireActor(), slug, input);
    revalidatePath("/[locale]/project/[slug]", "layout");
  });
}

/** Publish: makes sure the Vercel project and domain exist, then deploys the default branch. */
export async function publishAction(slug: string) {
  return runAction("studio.deploy.publish", { slug }, async () => {
    const result = await publish(await requireActor(), slug);
    revalidatePath("/[locale]/project/[slug]", "layout");
    return result;
  });
}

export async function refreshDeploymentsAction(slug: string) {
  return runAction("studio.deploy.refresh", { slug }, async () => {
    const count = await refreshDeployments(await requireProjectAccess(slug));
    revalidatePath("/[locale]/project/[slug]", "layout");
    return { count };
  });
}

export async function removeDeployAction(slug: string) {
  return runAction("studio.deploy.remove", { slug }, async () => {
    await removeDeployTarget(await requireActor(), slug);
    revalidatePath("/[locale]/project/[slug]", "layout");
  });
}
