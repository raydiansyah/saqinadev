"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction } from "@/lib/actions";
import {
  createDefinition,
  setDefinitionStatus,
  updateDefinition,
} from "@/lib/agent-definitions/service";
import { connectCli, setCliEnabled } from "@/lib/ai/cli/service";
import {
  createModel,
  createProvider,
  disconnectProvider,
  fetchProviderModels,
  importModels,
  setDefaults,
  setPolicy,
  setProviderEnabled,
  setRoleMapping,
  testProvider,
  updateModel,
  updateProvider,
} from "@/lib/ai/control-plane";
import { requireActor } from "@/lib/auth/server";
import {
  addCustomConnector,
  addPresetConnector,
  connectConnector,
  removeConnector,
  setConnectorEnabled,
  setConnectorTool,
} from "@/lib/connectors/service";
import { setPlatformRole } from "@/lib/platform/roles";
import {
  installSkillFromGithub,
  installSkillFromText,
  removePlatformSkill,
  updatePlatformSkill,
} from "@/lib/skills/service";
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
export const setCliEnabledAction = wrap("provider.cli.toggle", setCliEnabled);
export const connectCliAction = wrap("provider.cli.connect", connectCli);
export const testProviderAction = wrap("provider.test", testProvider);
export const fetchProviderModelsAction = wrap("model.fetch", fetchProviderModels);
export const importModelsAction = wrap("model.import", importModels);
export const createModelAction = wrap("model.create", createModel);
export const updateModelAction = wrap("model.update", updateModel);
export const setDefaultsAction = wrap("model.defaults", setDefaults);
export const setRoleMappingAction = wrap("mapping.set", setRoleMapping);
export const setPolicyAction = wrap("policy.set", setPolicy);
export const installSkillTextAction = wrap("skill.install", installSkillFromText);
export const installSkillGithubAction = wrap("skill.installGithub", (actor, input) =>
  installSkillFromGithub(actor, input),
);
export const updateSkillAction = wrap("skill.update", updatePlatformSkill);
export const removeSkillAction = wrap("skill.remove", removePlatformSkill);
export const addPresetConnectorAction = wrap("connector.preset", addPresetConnector);
export const addCustomConnectorAction = wrap("connector.custom", addCustomConnector);
export const connectConnectorAction = wrap("connector.connect", connectConnector);
export const setConnectorEnabledAction = wrap("connector.enable", setConnectorEnabled);
export const setConnectorToolAction = wrap("connector.tool", setConnectorTool);
export const removeConnectorAction = wrap("connector.remove", removeConnector);
export const setPlatformRoleAction = wrap("owner.set", (actor, input) => {
  const { email, role } = parse(
    z.object({ email: z.email(), role: z.enum(["user", "owner"]) }),
    input,
  );
  return setPlatformRole(actor, email, role);
});

const idAnd = (input: unknown) => {
  const { id, ...rest } = (input ?? {}) as { id?: string } & Record<string, unknown>;
  return { id: String(id ?? ""), rest };
};
export const createAgentDefinitionAction = wrap("agent_definition.create", createDefinition);
export const updateAgentDefinitionAction = wrap("agent_definition.update", (actor, input) => {
  const { id, rest } = idAnd(input);
  return updateDefinition(actor, id, rest);
});
export const setAgentDefinitionStatusAction = wrap("agent_definition.status", (actor, input) => {
  const { id, rest } = idAnd(input);
  return setDefinitionStatus(actor, id, rest.status);
});
