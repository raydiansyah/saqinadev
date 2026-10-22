import * as z from "zod";
import type { SkillEvaluation } from "@/lib/db/schema";
import { containsSecret } from "@/lib/secrets/scan";

const line = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, items: number) => z.array(line(max)).max(items).default([]);

/** What a skill says. Every field is bounded: a skill is read into agent prompts. */
export const skillContentSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(600),
  useCase: z.string().trim().max(600).default(""),
  triggers: list(200, 10),
  exclusions: list(200, 10),
  prerequisites: list(200, 10),
  steps: z
    .array(z.object({ title: line(160), detail: z.string().trim().max(800).default("") }))
    .min(1)
    .max(20),
  outputs: list(200, 10),
  validation: list(200, 10),
  resources: z
    .array(z.object({ label: line(120), ref: line(300) }))
    .max(10)
    .default([]),
});
export type SkillContent = z.output<typeof skillContentSchema>;

/** The text the registry's full-text index is built from. */
export const skillSearchText = (c: SkillContent) =>
  [c.name, c.description, c.useCase, ...c.triggers, ...c.steps.map((s) => s.title), ...c.outputs]
    .filter(Boolean)
    .join("\n");

/** One saved version as text, for `memory_versions` (history and diffs). */
export const skillVersionText = (c: SkillContent) => JSON.stringify(c, null, 2);

const texts = (c: SkillContent) => [
  c.name,
  c.description,
  c.useCase,
  ...c.triggers,
  ...c.exclusions,
  ...c.prerequisites,
  ...c.outputs,
  ...c.validation,
  ...c.resources.flatMap((r) => [r.label, r.ref]),
  ...c.steps.flatMap((s) => [s.title, s.detail]),
];

/**
 * Text that reads like an instruction to reach out, fetch, escalate or override. A skill is put
 * in front of agents, so a reviewer must look at these before it is approved.
 */
const RISKY = [
  /https?:\/\/|\bwww\./i,
  /\b(curl|wget|ncat|ssh|scp|sudo|eval)\b|\brm\s+-rf\b|\bchmod\s+7/i,
  /\.env\b|id_rsa|\.pem\b|\bcredentials?\b/i,
  /ignore\s+(all\s+|any\s+)?(previous|prior|above)|disregard\s+(the\s+)?(previous|above)|system\s+prompt/i,
];
export const looksRisky = (texts: string[]) => texts.some((t) => RISKY.some((re) => re.test(t)));

/**
 * Judges a skill before anyone is asked to review it. A skill with no way to tell if it worked,
 * with a single step, or that carries a secret is not worth a reviewer's time, and a proposal like
 * that is dropped. Everything else is stored with its score and its open issues, so the reviewer
 * sees what is weak.
 */
export function evaluateSkill(c: SkillContent): SkillEvaluation & { blocking: boolean } {
  const issues: string[] = [];
  let blocking = false;
  if (texts(c).some(containsSecret)) {
    issues.push("contains_secret");
    blocking = true;
  }
  if (c.steps.length < 2) {
    issues.push("single_step");
    blocking = true;
  }
  let score = 100;
  const deduct = (issue: string, points: number) => {
    issues.push(issue);
    score -= points;
  };
  if (c.validation.length === 0) deduct("no_validation", 30);
  if (c.triggers.length === 0) deduct("no_trigger", 20);
  if (c.outputs.length === 0) deduct("no_expected_output", 15);
  if (c.useCase.length === 0) deduct("no_use_case", 10);
  if (c.steps.some((s) => s.detail.length === 0)) deduct("steps_without_detail", 10);
  if (c.exclusions.length === 0) deduct("no_exclusions", 5);
  if (looksRisky(texts(c))) deduct("risky_content", 25);
  if (blocking) score = Math.min(score, 20);
  return { score: Math.max(0, score), issues, blocking };
}

/** A skill is judged worth keeping from this score up. */
export const MIN_PROPOSAL_SCORE = 50;

/** A skill as an agent reads it: when to use it, when not to, the steps and how to check them. */
export function renderSkill(c: SkillContent): string {
  const block = (label: string, items: string[]) =>
    items.length ? [`${label}:`, ...items.map((i) => `- ${i}`)] : [];
  return [
    `Skill: ${c.name}`,
    c.description,
    ...block("Use when", c.triggers),
    ...block("Do not use when", c.exclusions),
    ...block("Needs first", c.prerequisites),
    "Steps:",
    ...c.steps.map((s, i) => `${i + 1}. ${s.title}${s.detail ? `: ${s.detail}` : ""}`),
    ...block("Produces", c.outputs),
    ...block("Check it worked", c.validation),
  ].join("\n");
}
