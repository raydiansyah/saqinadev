"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import {
  configureAgentConnection,
  createCustomAgent,
  disconnectAgent,
  testAgentConnection,
} from "@/lib/agents/connections";
import {
  createHandoff,
  importResult,
  previewHandoff,
  setHandoffStatus,
} from "@/lib/agents/handoff";
import { setProjectAiSettings } from "@/lib/ai/project-settings";
import { requireActor } from "@/lib/auth/server";
import { connectRepository, disconnectRepository, syncRepository } from "@/lib/git/service";
import { connectMcp, createMcpConnection, disconnectMcp, setToolTrust } from "@/lib/mcp/service";
import { resolveStackMismatch, updateTechStack } from "@/lib/projects/stack";

const refresh = () => revalidatePath("/[locale]/project/[slug]", "layout");

type Fn<T> = (
  actor: Awaited<ReturnType<typeof requireActor>>,
  slug: string,
  input: unknown,
) => Promise<T>;
const wrap =
  <T>(name: string, fn: Fn<T>) =>
  async (slug: string, input: unknown) =>
    runAction(name, { slug }, async () => {
      const result = await fn(await requireActor(), slug, input);
      refresh();
      return result;
    });

export const connectRepositoryAction = wrap("repo.connect", connectRepository);
export const syncRepositoryAction = wrap("repo.sync", (a, s) => syncRepository(a, s));
export const disconnectRepositoryAction = wrap("repo.disconnect", (a, s) =>
  disconnectRepository(a, s),
);
export const createMcpAction = wrap("mcp.create", createMcpConnection);
export const connectMcpAction = wrap("mcp.connect", connectMcp);
export const disconnectMcpAction = wrap("mcp.disconnect", disconnectMcp);
export const setToolTrustAction = wrap("tool.trust", setToolTrust);
export const configureAgentAction = wrap("agent.configure", configureAgentConnection);
export const testAgentAction = wrap("agent.test", testAgentConnection);
export const disconnectAgentAction = wrap("agent.disconnect", disconnectAgent);
export const createCustomAgentAction = wrap("agent.custom", createCustomAgent);
export const previewHandoffAction = wrap("handoff.preview", previewHandoff);
export const createHandoffAction = wrap("handoff.create", (a, s, i) => createHandoff(a, s, i));
export const setHandoffStatusAction = wrap("handoff.status", setHandoffStatus);
export const importResultAction = wrap("handoff.import", importResult);
export const setProjectAiAction = wrap("project.ai", setProjectAiSettings);
export const updateStackAction = wrap("stack.update", updateTechStack);
export const resolveMismatchAction = wrap("stack.resolve", resolveStackMismatch);
