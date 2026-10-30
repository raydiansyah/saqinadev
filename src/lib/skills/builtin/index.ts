import type { SkillUse } from "@/lib/domain/enums";
import { ANTISLOP_CODE } from "./antislop/code";
import { ANTISLOP_COPYWRITING } from "./antislop/copywriting";
import { ANTISLOP_CORE } from "./antislop/core";
import { ANTISLOP_HUMAN } from "./antislop/human";
import { ANTISLOP_LAYOUTMOBILE } from "./antislop/layoutmobile";
import { ANTISLOP_UI } from "./antislop/ui";
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
 * Inside Saqina antislop always runs in its DURING mode (the platform's default): nobody is asked
 * which mode to use and nothing is installed. This line goes before each antislop skill's text.
 */
const ANTISLOP_MODE =
  "antislop runs in DURING mode here: apply its rules while you write. Do not ask about modes, do not install anything and do not announce the mode.";

/** Puts the mode line right after the SKILL.md front matter, so the file still parses as a skill. */
const duringMode = (skill: string) => {
  const end = skill.indexOf("\n---\n", 4);
  return end < 0
    ? `${ANTISLOP_MODE}\n\n${skill}`
    : `${skill.slice(0, end + 5)}\n${ANTISLOP_MODE}\n${skill.slice(end + 5)}`;
};

const ANTISLOP_SOURCE = "https://github.com/miqdadbadjuber/anti-slop/blob/main/skills";

/** antislop (release 3.2.24): the core filter plus one skill per concern. */
const ANTISLOP: BuiltinSkill[] = [
  {
    slug: "antislop",
    name: "antislop: core",
    description:
      "The core filter against generic AI slop in UI, copy and code: purpose test, mandatory rules, delivery gate.",
    sourceUrl: `${ANTISLOP_SOURCE}/antislop/SKILL.md`,
    uses: ["prd_generation", "plan_generation", "agent_run"],
    content: duringMode(ANTISLOP_CORE),
  },
  {
    slug: "antislop-copywriting",
    name: "antislop: copywriting",
    description:
      "Copy and text without AI tells: headlines, tone, calls to action, honest claims, clean markdown.",
    sourceUrl: `${ANTISLOP_SOURCE}/antislop-copywriting/SKILL.md`,
    uses: ["prd_generation", "plan_generation", "agent_run"],
    content: duringMode(ANTISLOP_COPYWRITING),
  },
  {
    slug: "antislop-ui",
    name: "antislop: UI",
    description:
      "Interface and visual work: color, layout, components, decoration, motion and page performance.",
    sourceUrl: `${ANTISLOP_SOURCE}/antislop-ui/SKILL.md`,
    uses: ["agent_run"],
    content: duringMode(ANTISLOP_UI),
  },
  {
    slug: "antislop-human",
    name: "antislop: people and accessibility",
    description:
      "Interfaces for real people: contrast, keyboard, focus, states and accessible interaction.",
    sourceUrl: `${ANTISLOP_SOURCE}/antislop-human/SKILL.md`,
    uses: ["agent_run"],
    content: duringMode(ANTISLOP_HUMAN),
  },
  {
    slug: "antislop-layoutmobile",
    name: "antislop: mobile layout",
    description:
      "Responsive and mobile layout from phone to desktop: breakpoints, grids, overflow, tap targets.",
    sourceUrl: `${ANTISLOP_SOURCE}/antislop-layoutmobile/SKILL.md`,
    uses: ["agent_run"],
    content: duringMode(ANTISLOP_LAYOUTMOBILE),
  },
  {
    slug: "antislop-code",
    name: "antislop: code comments",
    description:
      "Code comment hygiene: remove generic AI comments, keep the useful ones, never change the code.",
    sourceUrl: `${ANTISLOP_SOURCE}/antislop-code/SKILL.md`,
    uses: ["agent_run"],
    content: duringMode(ANTISLOP_CODE),
  },
];

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
  ...ANTISLOP,
];

export const builtinSkill = (slug: string) => BUILTIN_SKILLS.find((s) => s.slug === slug);
