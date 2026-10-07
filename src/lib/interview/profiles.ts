import type { EngineCopy } from "./copy/types";
import type { FeatureId, ProjectTypeId } from "./options";
import type { Answers } from "./types";

/**
 * Deterministic project profiles for the Phase 1 preview engine. Keywords cover English and
 * Indonesian. Names, users and modules come from engine copy so they follow the UI language.
 * Everything here is presented as a suggestion; a model-backed engine replaces it in Phase 2.
 */
export const PROFILE_IDS = [
  "restaurant-pos",
  "school-management",
  "clinic-booking",
  "retail-pos",
  "marketplace",
  "learning",
  "school-website",
  "online-store",
  "ai-tool",
  "portfolio",
  "company-website",
  "internal-tool",
  "saas",
] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export interface ProjectProfile {
  id: ProfileId;
  match: RegExp;
  type: ProjectTypeId;
  features: FeatureId[];
}

// Ordered from specific to generic: the first match wins.
export const PROFILES: ProjectProfile[] = [
  {
    id: "restaurant-pos",
    match: /\b(restaurant|restoran|rumah makan|cafe|kafe|coffee shop|kedai|warung|food stall)\b/,
    type: "pos",
    features: ["auth", "pos", "inventory", "reports", "rbac"],
  },
  {
    id: "school-management",
    match:
      /\b(school management|student information|academic system|school portal|sistem informasi sekolah|manajemen sekolah|sistem akademik)\b/,
    type: "learning-platform",
    features: ["auth", "dashboard", "crud", "reports", "rbac", "notification"],
  },
  {
    id: "clinic-booking",
    match:
      /\b(clinic|klinik|doctor|dokter|dental|dentist|dokter gigi|salon|barber|spa|therapist)\b/,
    type: "booking",
    features: ["booking", "notification", "dashboard"],
  },
  {
    id: "retail-pos",
    match: /\b(pos|point of sale|cashier|kasir|retail store|minimarket|toko kelontong)\b/,
    type: "pos",
    features: ["auth", "pos", "inventory", "reports"],
  },
  {
    id: "marketplace",
    match: /\b(marketplace|multi-?vendor|sellers? and buyers?|penjual dan pembeli)\b/,
    type: "marketplace",
    features: ["auth", "search", "filter", "payment", "rbac"],
  },
  {
    id: "learning",
    match:
      /\b(lms|course|courses|kursus|e-?learning|lesson|pelajaran|quiz|kuis|training|pelatihan)\b/,
    type: "learning-platform",
    features: ["auth", "dashboard", "file-upload", "reports"],
  },
  {
    id: "school-website",
    match: /\b(school|sekolah|kindergarten|paud|academy|akademi)\b/,
    type: "school-website",
    features: ["search"],
  },
  {
    id: "online-store",
    match:
      /\b(e-?commerce|online (shop|store)|webshop|toko online|jualan online|sell (my|our) products)\b/,
    type: "ecommerce",
    features: ["auth", "search", "payment", "inventory"],
  },
  {
    id: "ai-tool",
    match: /\b(ai|llm|chatbot|gpt|summari[sz]e|meringkas|transcribe|transkrip|ocr)\b/,
    type: "ai-application",
    features: ["auth", "ai", "file-upload"],
  },
  {
    id: "portfolio",
    match: /\b(portfolio|portofolio|personal site|situs pribadi|showcase my)\b/,
    type: "portfolio",
    features: [],
  },
  {
    id: "company-website",
    match:
      /\b(company profile|company website|corporate site|profil perusahaan|website perusahaan|company profil)\b/,
    type: "company-profile",
    features: ["search"],
  },
  {
    id: "internal-tool",
    match: /\b(internal|back ?office|admin panel|spreadsheet|excel)\b/,
    type: "internal-dashboard",
    features: ["auth", "dashboard", "crud", "reports"],
  },
  {
    id: "saas",
    match: /\b(saas|subscription|langganan|b2b software|teams? (track|manage))\b/,
    type: "saas",
    features: ["auth", "dashboard", "crud", "payment", "rbac"],
  },
];

export function findProfile(text: string): ProjectProfile | undefined {
  const lower = text.toLowerCase();
  if (!lower.trim()) return undefined;
  return PROFILES.find((p) => p.match.test(lower));
}

export function profileForType(type: ProjectTypeId): ProjectProfile | undefined {
  // The last profile of a type is its generic one (e.g. Retail POS rather than Restaurant POS).
  return PROFILES.filter((p) => p.type === type).at(-1);
}

/**
 * The profile that fits the answers: matched from the user's words first, then from the
 * chosen type. A profile that contradicts the chosen type is ignored.
 */
export function profileFor(answers: Answers): ProjectProfile | undefined {
  const profile =
    findProfile(`${answers.projectDescription} ${answers.objective}`) ??
    (answers.projectType ? profileForType(answers.projectType) : undefined);
  if (answers.projectType && profile?.type !== answers.projectType) return undefined;
  return profile;
}

/** Name from the user's own words only; a bare type keeps its plain label. */
export function nameFromText(answers: Answers, copy: EngineCopy): string | undefined {
  const fromText = findProfile(`${answers.projectDescription} ${answers.objective}`);
  if (!fromText || (answers.projectType && fromText.type !== answers.projectType)) return undefined;
  return copy.profiles[fromText.id].label;
}
