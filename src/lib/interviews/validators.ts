import * as z from "zod";
import { LANDING_CONCEPTS } from "@/content/landing-concepts";
import { RECOMMENDATION_KEYS } from "@/lib/domain/enums";
import {
  AGENTS,
  AUDIENCES,
  DATABASE_CHOICES,
  DATABASE_NEEDS,
  DEPLOYMENT_TARGETS,
  DEVELOPMENT_MODES,
  FEATURES,
  PROJECT_STATES,
  PROJECT_TYPES,
  TECH_PREFERENCES,
  VERSIONING_CHOICES,
} from "@/lib/interview/options";
import { STRUCTURES } from "@/lib/interview/types";
import {
  ANSWER_KEYS,
  type AnswerKey,
  AUTH_METHODS,
  FOLLOW_UP_ANSWERS,
  FOLLOW_UPS,
  PLATFORMS,
  type QuestionKey,
  STEPS,
  TIMELINES,
} from "./model";

const text = (max: number) => z.string().max(max);
const uniqueList = <T extends z.ZodType>(item: T, max: number) => z.array(item).max(max);

/** One schema per persisted question. Unknown keys are rejected at the boundary. */
export const QUESTION_SCHEMAS = {
  projectType: z.enum(PROJECT_TYPES).nullable(),
  projectDescription: text(2000),
  audience: uniqueList(z.enum(AUDIENCES), AUDIENCES.length),
  objective: text(2000),
  features: uniqueList(z.enum(FEATURES), FEATURES.length),
  featuresUnknown: z.boolean(),
  projectState: z.enum(PROJECT_STATES).nullable(),
  techPreference: z.enum(TECH_PREFERENCES).nullable(),
  ownStack: z.object({
    frontend: text(120),
    backend: text(120),
    database: text(120),
    auth: text(120),
    hosting: text(120),
    other: text(300),
  }),
  databaseNeed: z.enum(DATABASE_NEEDS).nullable(),
  databaseChoice: z.enum(DATABASE_CHOICES).nullable(),
  developmentMode: z.enum(DEVELOPMENT_MODES).nullable(),
  agent: z.enum(AGENTS).nullable(),
  deployment: z.enum(DEPLOYMENT_TARGETS).nullable(),
  versioning: z.enum(VERSIONING_CHOICES).nullable(),
  landing: z
    .object({
      primary: z.enum(LANDING_CONCEPTS),
      supporting: uniqueList(z.enum(LANDING_CONCEPTS), 2),
    })
    .nullable(),
  structure: z.enum(STRUCTURES).nullable(),
  dismissedInsights: uniqueList(text(64), 32),
  details: z.object({
    platforms: uniqueList(z.enum(PLATFORMS), PLATFORMS.length),
    authMethods: uniqueList(z.enum(AUTH_METHODS), AUTH_METHODS.length),
    followUps: z.partialRecord(z.enum(FOLLOW_UPS), z.enum(FOLLOW_UP_ANSWERS)),
    constraints: text(2000),
    timeline: z.enum(TIMELINES).optional(),
  }),
  overrides: z.partialRecord(z.enum(RECOMMENDATION_KEYS), text(200)),
  resolutions: z.record(text(64), text(64)),
  keptUnresolved: uniqueList(text(64), 64),
} satisfies Record<QuestionKey, z.ZodType>;

export const QUESTION_KEYS = Object.keys(QUESTION_SCHEMAS) as QuestionKey[];

const patchShape = Object.fromEntries(
  QUESTION_KEYS.map((key) => [key, QUESTION_SCHEMAS[key].optional()]),
) as { [K in QuestionKey]: z.ZodOptional<(typeof QUESTION_SCHEMAS)[K]> };

/** Autosave payload: a partial set of answers plus where the user is in the interview. */
export const saveAnswersInput = z.object({
  slug: text(80),
  patch: z.strictObject(patchShape),
  step: z.enum(STEPS),
  /** Keys the user explicitly confirmed (inferred → user). */
  confirm: uniqueList(z.enum(QUESTION_KEYS as [QuestionKey, ...QuestionKey[]]), 32).default([]),
});
export type SaveAnswersInput = z.input<typeof saveAnswersInput>;

/** Phase 1 preview answers carried over from the browser. Only answer keys are accepted. */
export const importedAnswersInput = z.object(
  Object.fromEntries(ANSWER_KEYS.map((key) => [key, QUESTION_SCHEMAS[key].optional()])) as {
    [K in AnswerKey]: z.ZodOptional<(typeof QUESTION_SCHEMAS)[K]>;
  },
);
