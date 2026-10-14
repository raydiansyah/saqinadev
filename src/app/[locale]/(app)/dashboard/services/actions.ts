"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import { requireActor } from "@/lib/auth/server";
import {
  archiveService,
  createService,
  duplicateService,
  moveService,
  seedStarterServices,
  setServiceFlag,
  updateService,
} from "@/lib/services/admin";
import { parse } from "@/lib/validation";

/** Public pages and the owner list both read the catalog, so both caches are cleared. */
function refresh() {
  revalidatePath("/[locale]/services", "layout");
  revalidatePath("/[locale]/dashboard/services", "layout");
}

const idSchema = z.uuid();

/** Every service function re-checks platform ownership; the action only validates the id. */
const wrap =
  <T>(name: string, fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<T>) =>
  async () =>
    runAction(`services.${name}`, {}, async () => {
      const result = await fn(await requireActor());
      refresh();
      return result;
    });

export const createServiceAction = async (input: unknown) =>
  runAction("services.create", {}, async () => {
    const result = await createService(await requireActor(), input);
    refresh();
    return result;
  });

export const updateServiceAction = async (id: string, input: unknown) =>
  runAction("services.update", {}, async () => {
    const serviceId = parse(idSchema, id);
    await updateService(await requireActor(), serviceId, input);
    refresh();
    return { id: serviceId };
  });

export const setServiceFlagAction = async (id: string, flag: string, value: boolean) =>
  runAction("services.flag", {}, async () => {
    await setServiceFlag(await requireActor(), parse(idSchema, id), { flag, value });
    refresh();
  });

export const moveServiceAction = async (id: string, direction: "up" | "down") =>
  runAction("services.move", {}, async () => {
    const dir = parse(z.enum(["up", "down"]), direction);
    await moveService(await requireActor(), parse(idSchema, id), dir);
    refresh();
  });

export const archiveServiceAction = async (id: string, archived: boolean) =>
  runAction("services.archive", {}, async () => {
    await archiveService(await requireActor(), parse(idSchema, id), parse(z.boolean(), archived));
    refresh();
  });

export const duplicateServiceAction = async (id: string) =>
  runAction("services.duplicate", {}, async () => {
    const copy = await duplicateService(await requireActor(), parse(idSchema, id));
    refresh();
    return copy;
  });

export const seedServicesAction = wrap("seed", async (actor) => ({
  added: await seedStarterServices(actor),
}));
