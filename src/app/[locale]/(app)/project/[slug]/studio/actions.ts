"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { requireActor, requireProjectAccess } from "@/lib/auth/server";
import {
  publish,
  refreshDeployments,
  removeDeployTarget,
  setupDeployTarget,
  syncServiceEnv,
} from "@/lib/deploy/service";
import { getExecutionDelivery } from "@/lib/executions/delivery";
import { getExecutionDiff } from "@/lib/executions/diff";
import {
  buildFromPlan,
  cancelExecution,
  retryTask,
  revisePlan,
  startExecution,
} from "@/lib/executions/service";
import { removeService, saveService } from "@/lib/services/service";
import { buildNow } from "@/lib/studio/build-now";
import { listCode, readCode } from "@/lib/studio/code";

/** "Start building" on an approved document: starts a Build execution the Studio then follows. */
export async function buildNowAction(slug: string, request: string) {
  return runAction("studio.buildNow", { slug }, async () => {
    const result = await buildNow(await requireActor(), slug, request);
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

/** Adds or updates a database or sign-in service. Values are write-only. */
export async function saveServiceAction(slug: string, input: unknown) {
  return runAction("studio.service.save", { slug }, async () => {
    const actor = await requireActor();
    const access = await requireProjectAccess(slug);
    const result = await saveService(actor, slug, input);
    await syncServiceEnv(access.project.id);
    revalidatePath("/[locale]/project/[slug]", "layout");
    return result;
  });
}

export async function removeServiceAction(slug: string, id: string) {
  return runAction("studio.service.remove", { slug }, async () => {
    await removeService(await requireActor(), slug, { id });
    revalidatePath("/[locale]/project/[slug]", "layout");
  });
}

/** Plan or Build from the composer. Returns at once; a worker does the rest. */
export async function startExecutionAction(slug: string, input: unknown) {
  return runAction("studio.execution.start", { slug }, async () => {
    const execution = await startExecution(await requireActor(), slug, input);
    revalidatePath("/[locale]/project/[slug]", "layout");
    return { id: execution.id, conversationId: execution.conversationId };
  });
}

export async function cancelExecutionAction(slug: string, executionId: string) {
  return runAction("studio.execution.cancel", { slug }, async () => {
    const execution = await cancelExecution(await requireActor(), slug, executionId);
    return { status: execution.status };
  });
}

export async function retryTaskAction(slug: string, executionId: string, taskId: string) {
  return runAction("studio.execution.retry", { slug }, async () => {
    await retryTask(await requireActor(), slug, executionId, taskId);
  });
}

/** "Build this plan": the planned tasks start on a work branch. */
export async function buildFromPlanAction(slug: string, executionId: string) {
  return runAction("studio.execution.build", { slug }, async () => {
    await buildFromPlan(await requireActor(), slug, executionId);
  });
}

export async function revisePlanAction(slug: string, executionId: string, input: unknown) {
  return runAction("studio.execution.revise", { slug }, async () => {
    await revisePlan(await requireActor(), slug, executionId, input);
  });
}

/** What the work branch changed, from the repository host. Read only. */
export async function getExecutionDiffAction(slug: string, executionId: string) {
  return runAction("studio.execution.diff", { slug }, async () =>
    getExecutionDiff(await requireActor(), slug, executionId),
  );
}

/** CI, preview and the five publishing stages of an execution. Read only. */
export async function getExecutionDeliveryAction(slug: string, executionId: string) {
  return runAction("studio.execution.delivery", { slug }, async () =>
    getExecutionDelivery(await requireActor(), slug, executionId),
  );
}
