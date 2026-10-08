"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import {
  createModel,
  createProvider,
  disconnectProvider,
  setDefaults,
  setPolicy,
  setProviderEnabled,
  setRoleMapping,
  testProvider,
  updateModel,
  updateProvider,
} from "@/lib/ai/control-plane";
import { requireActor } from "@/lib/auth/server";
import { setPlatformRole } from "@/lib/platform/roles";
import { parse } from "@/lib/validation";

const refresh = () => revalidatePath("/[locale]/dashboard/ai", "layout");

/** Every action re-checks platform ownership inside the service. */
const wrap =
  <T>(
    name: string,
    fn: (actor: Awaited<ReturnType<typeof requireActor>>, input: unknown) => Promise<T>,
  ) =>
  async (input: unknown) =>
    runAction(`ai.${name}`, {}, async () => {
      const result = await fn(await requireActor(), input);
      refresh();
      return result;
    });

export const createProviderAction = wrap("provider.create", createProvider);
export const updateProviderAction = wrap("provider.update", updateProvider);
export const setProviderEnabledAction = wrap("provider.enable", setProviderEnabled);
export const disconnectProviderAction = wrap("provider.disconnect", disconnectProvider);
export const testProviderAction = wrap("provider.test", testProvider);
export const createModelAction = wrap("model.create", createModel);
export const updateModelAction = wrap("model.update", updateModel);
export const setDefaultsAction = wrap("model.defaults", setDefaults);
export const setRoleMappingAction = wrap("mapping.set", setRoleMapping);
export const setPolicyAction = wrap("policy.set", setPolicy);
export const setPlatformRoleAction = wrap("owner.set", (actor, input) => {
  const { email, role } = parse(
    z.object({ email: z.email(), role: z.enum(["user", "owner"]) }),
    input,
  );
  return setPlatformRole(actor, email, role);
});
