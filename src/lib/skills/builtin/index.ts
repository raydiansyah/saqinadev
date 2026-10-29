import type { SkillUse } from "@/lib/domain/enums";
import { BRAINSTORMING } from "./superpowers/brainstorming";
import { WRITING_PLANS } from "./superpowers/writing-plans";

export interface BuiltinSkill {
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  uses: SkillUse[];
  content: string;
}

/**
 * Skills every Saqina install starts with. Their text lives here, not in the database, so an
 * update ships with the code; the owner can only switch them on or off.
 */
export const BUILTIN_SKILLS: readonly BuiltinSkill[] = [
  {
    slug: "superpowers-brainstorming",
    name: "Superpowers: brainstorming",
    description:
      "Settle what is wanted and why before anything is built: intent, requirements and design.",
    sourceUrl: "https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md",
    uses: ["prd_generation", "agent_run"],
    content: BRAINSTORMING,
  },
  {
    slug: "superpowers-writing-plans",
    name: "Superpowers: writing plans",
    description: "Turn an agreed design into a step-by-step implementation plan before any code.",
    sourceUrl: "https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md",
    uses: ["plan_generation", "agent_run"],
    content: WRITING_PLANS,
  },
];

export const builtinSkill = (slug: string) => BUILTIN_SKILLS.find((s) => s.slug === slug);
