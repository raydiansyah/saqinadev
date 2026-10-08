import type { AiProvider } from "@/lib/ai/provider";
import { log } from "@/lib/log";
import { classifyWithRules } from "./rules";
import {
  type ClassifierContext,
  INTENTS,
  type IntentClassification,
  intentClassification,
} from "./types";

const SYSTEM = [
  "You classify one message sent to Saqina, a software project assistant.",
  `Pick exactly one intent from: ${INTENTS.join(", ")}.`,
  "Extract only entities that are stated in the message. Do not invent titles or priorities.",
  "Use target=current when the message refers to the item the user is viewing (this task, ini).",
].join(" ");

/**
 * Model-assisted classification with a deterministic floor: rules run first, the model is
 * consulted only when one is configured, and its answer is used only if it validates and is
 * at least as confident as the rules.
 */
export async function classifyIntent(
  message: string,
  ctx: ClassifierContext,
  provider: AiProvider,
  signal?: AbortSignal,
): Promise<IntentClassification> {
  const rules = classifyWithRules(message, ctx);
  if (provider.deterministic || rules.confidence >= 0.9) return rules;
  try {
    const model = await provider.generateObject(
      {
        system: SYSTEM,
        segments: ctx.entity
          ? [
              {
                kind: "project_data",
                label: "current view",
                content: `${ctx.entity.type}: ${ctx.entity.title}`,
              },
            ]
          : [],
        userMessage: message,
        draft: JSON.stringify(rules),
        maxOutputTokens: 300,
        signal,
      },
      intentClassification,
      "classify_intent",
    );
    return model.confidence >= rules.confidence ? model : rules;
  } catch (error) {
    log.warn("assistant.classify_fallback", { error: String(error) });
    return rules;
  }
}
