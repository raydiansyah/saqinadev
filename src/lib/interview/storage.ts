import * as z from "zod/mini";
import { LANDING_CONCEPTS } from "@/content/landing-concepts";
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
} from "./options";
import type { InterviewState } from "./state";
import { STEPS, STRUCTURES } from "./types";

// v2: `structure` is stored as an id instead of a display string.
export const STORAGE_KEY = "saqina.interview.v2";

// zod/mini keeps this validator small: the /start bundle is prefetched from the landing page.
const text = (max: number) => z.string().check(z.maxLength(max));
const list = <T extends z.core.SomeType>(item: T, max: number) =>
  z.array(item).check(z.maxLength(max));
const choice = <const T extends readonly string[]>(values: T) => z.optional(z.enum(values));

const answersSchema = z.object({
  projectType: choice(PROJECT_TYPES),
  projectDescription: text(2000),
  audience: list(z.enum(AUDIENCES), AUDIENCES.length),
  objective: text(2000),
  features: list(z.enum(FEATURES), FEATURES.length),
  featuresUnknown: z.boolean(),
  projectState: choice(PROJECT_STATES),
  techPreference: choice(TECH_PREFERENCES),
  ownStack: z.object({
    frontend: text(120),
    backend: text(120),
    database: text(120),
    auth: text(120),
    hosting: text(120),
    other: text(300),
  }),
  databaseNeed: choice(DATABASE_NEEDS),
  databaseChoice: choice(DATABASE_CHOICES),
  developmentMode: choice(DEVELOPMENT_MODES),
  agent: choice(AGENTS),
  deployment: choice(DEPLOYMENT_TARGETS),
  versioning: choice(VERSIONING_CHOICES),
  landing: z.optional(
    z.object({
      primary: z.enum(LANDING_CONCEPTS),
      supporting: list(z.enum(LANDING_CONCEPTS), 2),
    }),
  ),
  structure: z.optional(z.enum(STRUCTURES)),
  dismissedInsights: list(text(64), 32),
});

const stateSchema = z.object({
  answers: answersSchema,
  step: z.enum(STEPS),
  returnToReview: z.boolean(),
  accepted: z.boolean(),
});

/** Parses persisted state. Anything malformed or from an older shape is discarded. */
export function parseState(raw: string | null): InterviewState | null {
  if (!raw) return null;
  try {
    const result = stateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function loadState(): InterviewState | null {
  try {
    return parseState(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be unavailable (privacy mode, disabled cookies).
    return null;
  }
}

export function saveState(state: InterviewState): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: the interview keeps working in memory.
  }
}

export function clearState(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
