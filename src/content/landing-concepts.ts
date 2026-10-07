/** The 18 landing page concepts the interview can recommend from. Names live in engine copy. */

export const LANDING_CONCEPTS = [
  "cinematic-scroll",
  "product-led",
  "file-to-result",
  "pinned-stage",
  "feature-choreography",
  "interactive-demo",
  "product-3d",
  "horizontal-rail",
  "layered-parallax",
  "before-after",
  "guided-narrative",
  "dashboard-journey",
  "data-viz-narrative",
  "system-map",
  "conversion-minimal",
  "adaptive-motion",
  "motion-system",
  "performance-seo",
] as const;

export type LandingConceptId = (typeof LANDING_CONCEPTS)[number];

export const MAX_SUPPORTING_CONCEPTS = 2;

/** Groups used by the recommendation engine and the "Change concept" picker. */
export const CONCEPT_CATEGORIES = [
  { id: "story", concepts: ["cinematic-scroll", "guided-narrative", "product-led"] },
  {
    id: "interaction",
    concepts: ["interactive-demo", "feature-choreography", "pinned-stage", "before-after"],
  },
  { id: "spatial", concepts: ["product-3d", "horizontal-rail", "layered-parallax"] },
  {
    id: "system",
    concepts: ["dashboard-journey", "system-map", "data-viz-narrative", "file-to-result"],
  },
  { id: "conversion", concepts: ["conversion-minimal"] },
  { id: "foundation", concepts: ["adaptive-motion", "motion-system", "performance-seo"] },
] as const satisfies readonly { id: string; concepts: readonly LandingConceptId[] }[];

export type ConceptCategoryId = (typeof CONCEPT_CATEGORIES)[number]["id"];

export function categoryOf(id: LandingConceptId) {
  return CONCEPT_CATEGORIES.find((c) => (c.concepts as readonly LandingConceptId[]).includes(id));
}

export function isConcept(id: string): id is LandingConceptId {
  return (LANDING_CONCEPTS as readonly string[]).includes(id);
}
