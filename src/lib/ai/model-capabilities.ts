import type { ModelCapability, ProviderAdapterId } from "@/lib/domain/enums";

/**
 * A provider's model list carries ids, not abilities. This guesses the abilities of well-known
 * model families so a fetched model is usable straight away; the owner can correct any guess in
 * the model's Edit dialog. Unknown families get only what every chat model does: nothing here
 * ever promises structured output for a model it does not recognise.
 */

/** Ids that are not chat models: they cannot answer a prompt, so they are never offered. */
const NOT_CHAT =
  /(embed|whisper|tts|speech|transcribe|dall-?e|image|imagen|moderation|rerank|realtime|audio|davinci|babbage|computer-use|search-preview|guard)/i;

export const isChatModel = (modelId: string) => !NOT_CHAT.test(modelId);

const FAMILY = {
  claude: /^claude/i,
  gpt: /^(gpt-|chatgpt|o\d)/i,
  gemini: /^gemini/i,
};

export function inferCapabilities(adapter: ProviderAdapterId, modelId: string): ModelCapability[] {
  const id = modelId.replace(/^.*\//, ""); // gateways prefix the vendor: anthropic/claude-…
  const out = new Set<ModelCapability>(["text", "streaming"]);
  const known = FAMILY.claude.test(id) || FAMILY.gpt.test(id) || FAMILY.gemini.test(id);
  // Compatible endpoints host anything, so they only get the structured abilities when the id
  // itself names a family that has them.
  const trusted = known || (adapter !== "openai_compatible" && adapter !== "anthropic_compatible");
  if (known) {
    out.add("structured_output");
    out.add("tool_calling");
  } else if (trusted) {
    out.add("tool_calling");
  }
  if (known) out.add("coding");
  if (/(^o\d|reason|think|opus|sonnet|gpt-5|gemini-2\.5|gemini-3|r1)/i.test(id))
    out.add("reasoning");
  if (
    /(claude-(3|[4-9]|opus|sonnet|haiku)|gpt-4o|gpt-4\.1|gpt-5|gpt-4-turbo|^o\d|gemini)/i.test(id)
  )
    out.add("vision");
  if (/(claude|gemini|gpt-4\.1|gpt-5|gpt-4o)/i.test(id)) out.add("long_context");
  return [...out];
}

/** A readable name from an id: "claude-sonnet-5-5" stays recognisable, vendor prefixes drop. */
export function displayNameFor(modelId: string): string {
  return modelId
    .replace(/^.*\//, "")
    .replace(/^models\//, "")
    .slice(0, 80);
}
