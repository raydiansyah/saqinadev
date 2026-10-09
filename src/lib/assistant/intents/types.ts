import * as z from "zod";
import { PRIORITIES } from "@/lib/domain/enums";

/** Everything Saqina can recognise in a message. Add new intents here first. */
export const INTENTS = [
  "ASK_PROJECT",
  "ASK_REQUIREMENT",
  "ASK_PRD",
  "ASK_TASK",
  "ASK_DECISION",
  "ASK_MEMORY",
  "CREATE_TASK",
  "UPDATE_TASK",
  "COMPLETE_TASK",
  "DELETE_TASKS",
  "SPLIT_TASK",
  "CREATE_REQUIREMENT",
  "UPDATE_REQUIREMENT",
  "ADD_FEATURE",
  "UPDATE_PRD",
  "CREATE_MEMORY",
  "CREATE_DECISION",
  "ANALYZE_PROJECT",
  "ANALYZE_REQUIREMENTS",
  "ANALYZE_PRD",
  "ANALYZE_TASKS",
  "GENERATE_PLAN",
  "GENERATE_PRD",
  "ASSIGN_AGENT",
  "RUN_AGENT",
  "REQUEST_APPROVAL",
  "HANDOFF_AGENT",
  "ASK_REPOSITORY",
  "ANALYZE_REPOSITORY",
  "ASK_BILLING",
  "SETUP_BILLING",
  "CREATE_INVOICE",
  "ASK_SCOPE",
  "ADD_SCOPE_ITEM",
  "HELP",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Which part of the project a message is about. `current` = the entity the user is viewing. */
export const TARGETS = ["current", "all_not_started", "blocked"] as const;

export const intentEntities = z.object({
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  role: z.string().trim().max(80).optional(),
  feature: z.string().trim().max(160).optional(),
  topic: z.string().trim().max(160).optional(),
  target: z.enum(TARGETS).optional(),
  /** External agent named in the message ("kirim ke Codex"). */
  agent: z.string().trim().max(60).optional(),
  /** Scope category named in the message ("ke excluded"). */
  category: z.enum(["included", "excluded", "optional", "future"]).optional(),
});
export type IntentEntities = z.infer<typeof intentEntities>;

/** Also the schema a model must satisfy; anything else is rejected before use. */
export const intentClassification = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  entities: intentEntities,
});
export type IntentClassification = z.infer<typeof intentClassification>;

/** A clarification Saqina is waiting on, stored on the assistant message that asked it. */
export const pendingIntent = z.object({
  intent: z.enum(INTENTS),
  entities: intentEntities,
  /** Which question was asked, so the answer lands in the right field. */
  question: z.string().max(80),
});
export type PendingIntent = z.infer<typeof pendingIntent>;

export interface ClassifierContext {
  /** The entity the user is looking at, already verified to belong to the project. */
  entity?: { type: string; id: string | null; title: string } | null;
}
