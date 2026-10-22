"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { loadProjectAccess } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { createBinding, revokeBinding } from "@/lib/memory/bindings";
import { requestCodeReindex } from "@/lib/memory/code/schedule";
import { retryJob } from "@/lib/memory/jobs";
import {
  approveMemory,
  archiveMemory,
  deleteMemory,
  rejectMemory,
  restoreMemory,
  setLevel,
} from "@/lib/memory/lifecycle";
import { scheduleMemoryJobs } from "@/lib/memory/schedule";
import { createMemory, updateMemory } from "@/lib/memory/service";
import { changeVisibility } from "@/lib/memory/sharing";
import {
  approveSkill,
  archiveSkill,
  createSkill,
  deleteSkill,
  rejectSkill,
  restoreSkill,
  setSkillVisibility,
  updateSkill,
} from "@/lib/memory/skills/service";
import { recordSkillFeedback } from "@/lib/memory/skills/usage";
import { importMemoryPackage } from "@/lib/memory/transfer/import";
import { MAX_PACKAGE_BYTES } from "@/lib/memory/transfer/package";
import { requestWikiReindex } from "@/lib/memory/wiki/schedule";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

export async function createMemoryAction(slug: string, input: unknown) {
  return runAction("memory.create", { slug }, async () => {
    await createMemory(await requireActor(), slug, input);
    refresh();
  });
}

export async function updateMemoryAction(slug: string, input: unknown) {
  return runAction("memory.update", { slug }, async () => {
    await updateMemory(await requireActor(), slug, input);
    refresh();
  });
}

/** One server action per lifecycle step; each only forwards to the service, which does the checks. */
export async function approveMemoryAction(slug: string, input: unknown) {
  return runAction("memory.approve", { slug }, async () => {
    await approveMemory(await requireActor(), slug, input);
    refresh();
  });
}

export async function rejectMemoryAction(slug: string, input: unknown) {
  return runAction("memory.reject", { slug }, async () => {
    await rejectMemory(await requireActor(), slug, input);
    refresh();
  });
}

export async function archiveMemoryAction(slug: string, input: unknown) {
  return runAction("memory.archive", { slug }, async () => {
    await archiveMemory(await requireActor(), slug, input);
    refresh();
  });
}

export async function restoreMemoryAction(slug: string, input: unknown) {
  return runAction("memory.restore", { slug }, async () => {
    await restoreMemory(await requireActor(), slug, input);
    refresh();
  });
}

export async function deleteMemoryAction(slug: string, input: unknown) {
  return runAction("memory.delete", { slug }, async () => {
    await deleteMemory(await requireActor(), slug, input);
    refresh();
  });
}

export async function changeVisibilityAction(slug: string, input: unknown) {
  return runAction("memory.visibility", { slug }, async () => {
    await changeVisibility(await requireActor(), slug, input);
    refresh();
  });
}

export async function setLevelAction(slug: string, input: unknown) {
  return runAction("memory.level", { slug }, async () => {
    await setLevel(await requireActor(), slug, input);
    refresh();
  });
}

export async function retryJobAction(slug: string, jobId: string) {
  return runAction("memory.job.retry", { slug }, async () => {
    await retryJob(await requireActor(), slug, jobId);
    refresh();
  });
}

export async function createBindingAction(slug: string, input: unknown) {
  return runAction("memory.binding.create", { slug }, async () => {
    await createBinding(await requireActor(), slug, input);
    refresh();
  });
}

export async function revokeBindingAction(slug: string, input: unknown) {
  return runAction("memory.binding.revoke", { slug }, async () => {
    await revokeBinding(await requireActor(), slug, input);
    refresh();
  });
}

export async function reindexWikiAction(slug: string) {
  return runAction("memory.wiki.reindex", { slug }, async () => {
    const access = await loadProjectAccess(await requireActor(), { slug }, "members:manage");
    await requestWikiReindex(access.project.id);
    scheduleMemoryJobs(access.project.id);
    refresh();
  });
}

/** Skills: one server action per step, each only forwards to the service that checks everything. */
export async function createSkillAction(slug: string, input: unknown) {
  return runAction("memory.skill.create", { slug }, async () => {
    const id = await createSkill(await requireActor(), slug, input);
    refresh();
    return { id };
  });
}

export async function updateSkillAction(slug: string, input: unknown) {
  return runAction("memory.skill.update", { slug }, async () => {
    await updateSkill(await requireActor(), slug, input);
    refresh();
  });
}

export async function approveSkillAction(slug: string, input: unknown) {
  return runAction("memory.skill.approve", { slug }, async () => {
    await approveSkill(await requireActor(), slug, input);
    refresh();
  });
}

export async function rejectSkillAction(slug: string, input: unknown) {
  return runAction("memory.skill.reject", { slug }, async () => {
    await rejectSkill(await requireActor(), slug, input);
    refresh();
  });
}

export async function archiveSkillAction(slug: string, input: unknown) {
  return runAction("memory.skill.archive", { slug }, async () => {
    await archiveSkill(await requireActor(), slug, input);
    refresh();
  });
}

export async function restoreSkillAction(slug: string, input: unknown) {
  return runAction("memory.skill.restore", { slug }, async () => {
    await restoreSkill(await requireActor(), slug, input);
    refresh();
  });
}

export async function deleteSkillAction(slug: string, input: unknown) {
  return runAction("memory.skill.delete", { slug }, async () => {
    await deleteSkill(await requireActor(), slug, input);
    refresh();
  });
}

export async function setSkillVisibilityAction(slug: string, input: unknown) {
  return runAction("memory.skill.visibility", { slug }, async () => {
    const result = await setSkillVisibility(await requireActor(), slug, input);
    refresh();
    return { result };
  });
}

export async function skillFeedbackAction(slug: string, input: unknown) {
  return runAction("memory.skill.feedback", { slug }, async () => {
    await recordSkillFeedback(await requireActor(), slug, input);
    refresh();
  });
}

export async function reindexCodeAction(slug: string) {
  return runAction("memory.code.reindex", { slug }, async () => {
    const access = await loadProjectAccess(await requireActor(), { slug }, "members:manage");
    await requestCodeReindex(access.project.id);
    scheduleMemoryJobs(access.project.id);
    refresh();
  });
}

/** The package arrives as text from a file the person chose; the service validates all of it. */
export async function importMemoryAction(slug: string, text: string) {
  return runAction("memory.import", { slug }, async () => {
    // Bytes, not characters: the limit is on what travels, and non-Latin text is wider.
    if (new TextEncoder().encode(text).length > MAX_PACKAGE_BYTES) {
      throw new AppError("VALIDATION_ERROR", "too_large", { package: "too_large" });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError("VALIDATION_ERROR", "invalid_json", { package: "invalid" });
    }
    const result = await importMemoryPackage(await requireActor(), slug, raw);
    refresh();
    return result;
  });
}
