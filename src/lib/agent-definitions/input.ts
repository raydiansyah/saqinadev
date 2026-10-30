import * as z from "zod";
import { FORBIDDEN_PERMISSIONS } from "@/lib/agents/capabilities";
import { AGENT_PERMISSIONS } from "@/lib/domain/enums";
import { AGENT_DEFINITION_ROLES } from "@/lib/domain/executions";
import { STATIC_TOOLS } from "@/lib/tools/catalog";

/** Tools an agent definition may list: the built-in ones, minus anything that needs a forbidden permission. */
export const ALLOWED_TOOL_NAMES: readonly string[] = STATIC_TOOLS.filter(
  (t) => !t.agentPermission || !FORBIDDEN_PERMISSIONS.includes(t.agentPermission),
).map((t) => t.name);

export const GRANTABLE_PERMISSIONS = AGENT_PERMISSIONS.filter(
  (p) => !FORBIDDEN_PERMISSIONS.includes(p),
);

export const DEFINITION_KEY = /^[a-z][a-z0-9-]{1,40}$/;

const lines = (max: number, each = 300) =>
  z.array(z.string().trim().min(1).max(each)).max(max).default([]);

/** Everything an Owner edits. Unknown fields are refused, so status and version cannot be smuggled in. */
export const definitionConfig = z.strictObject({
  name: z.string().trim().min(2).max(60),
  role: z.enum(AGENT_DEFINITION_ROLES),
  description: z.string().trim().max(600).default(""),
  instructions: z.string().trim().min(10).max(8000),
  responsibilities: lines(12),
  allowedScope: lines(12),
  forbidden: lines(12),
  inputRequirements: z.string().trim().max(1000).default(""),
  expectedOutput: z.string().trim().max(1000).default(""),
  definitionOfDone: lines(12),
  modelId: z.uuid().nullable().default(null),
  tools: z.array(z.enum(ALLOWED_TOOL_NAMES as [string, ...string[]])).max(40),
  permissions: z.array(z.enum(GRANTABLE_PERMISSIONS as [string, ...string[]])).max(14),
  skills: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  handoffTargets: z.array(z.string().regex(DEFINITION_KEY)).max(10).default([]),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  timeoutMs: z.number().int().min(10_000).max(900_000).default(300_000),
  priority: z.number().int().min(-10).max(10).default(0),
});

export const createDefinitionInput = definitionConfig.extend({
  key: z.string().regex(DEFINITION_KEY),
});

export type DefinitionConfig = z.output<typeof definitionConfig>;
export type CreateDefinitionInput = z.output<typeof createDefinitionInput>;

/** The editable fields, in the order they are compared and listed in the audit trail. */
export const CONFIG_FIELDS = Object.keys(definitionConfig.shape) as Array<keyof DefinitionConfig>;
