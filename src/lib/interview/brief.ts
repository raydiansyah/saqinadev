import { defaultCopy, type EngineCopy } from "./copy";
import type { Recommendation } from "./types";

/** Renders the interview result as a Markdown brief any agent or person can read. */
export function toMarkdownBrief(rec: Recommendation, copy: EngineCopy = defaultCopy): string {
  const b = copy.brief;
  const list = (items: string[]) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${b.none}`;
  const label = (f: Recommendation["features"]["selected"][number]) =>
    copy.options.feature[f].label;
  const source = (chosen: boolean) => (chosen ? b.chosen : b.recommended);

  const sections = [
    `# ${rec.projectLabel}`,
    b.intro,
    `## ${b.objective}`,
    rec.objective || b.notSpecified,
    `## ${b.audience}`,
    list(rec.audience),
    `## ${b.features}`,
    list([
      ...rec.features.selected.map(label),
      ...rec.features.suggested.map((f) => `${label(f)} (${b.suggested})`),
    ]),
    `${b.complexity}: **${copy.complexity.names[rec.complexity.level]}**. ${rec.complexity.reason}`,
    `## ${b.development}`,
    `- ${b.status}: ${rec.projectState}`,
    `- ${b.mode}: ${rec.development.value === "saqina" ? b.modeSaqina : b.modeAgent} (${source(rec.development.chosen)}). ${rec.development.reason}`,
    ...(rec.agent
      ? [`- ${b.agent}: ${rec.agent.value} (${source(rec.agent.chosen)}). ${rec.agent.reason}`]
      : []),
    `## ${b.stack}`,
    list(rec.stack.value.map((s) => `${s.layer}: ${s.value}`)),
    rec.stack.reason,
    `## ${b.dataDeploy}`,
    `- ${b.database}: ${rec.database.value}. ${rec.database.reason}`,
    `- ${b.deployment}: ${rec.deployment.value}. ${rec.deployment.reason}`,
    `- ${b.pipeline}: ${rec.deployment.steps.join(" > ")}`,
    ...(rec.versioning
      ? [`- ${b.versioning}: ${rec.versioning.value ? b.yes : b.no}. ${rec.versioning.reason}`]
      : []),
  ];

  if (rec.landing) {
    sections.push(
      `## ${b.landing}`,
      `- ${b.primary}: ${copy.concepts[rec.landing.primary].name}`,
      ...rec.landing.supporting.map((id) => `- ${b.supporting}: ${copy.concepts[id].name}`),
      "",
      rec.landing.reason,
    );
  }

  sections.push(`## ${b.integrations}`, list(rec.futureIntegrations));
  return `${sections.join("\n\n")}\n`;
}
