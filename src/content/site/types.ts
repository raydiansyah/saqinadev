/**
 * All landing page copy for one language. Plain data only (no functions) so slices can be
 * passed from Server Components to Client Components as props.
 */
export interface SiteContent {
  meta: {
    title: string;
    description: string;
    tagline: string;
    ogSubtitle: string;
    ogFooter: string;
  };
  hero: {
    title: string;
    lead: string;
    points: string[];
    primaryCta: string;
    secondaryCta: string;
    /** Labels on the floating 3D project cards. */
    cards: { label: string; value: string }[];
  };
  lifecycle: {
    file: string;
    title: string;
    steps: { name: string; point: string }[];
    pause: string;
    play: string;
  };
  pillars: {
    file: string;
    title: string;
    items: { id: "project" | "portal" | "ai"; name: string; points: string[] }[];
    orbit: string[];
    portal: { label: string; value: string; due: string };
    prompts: string[];
  };
  demo: {
    title: string;
    body: string;
    label: string;
    placeholder: string;
    error: string;
    submit: string;
    tryOne: string;
    examples: string[];
    empty: string;
    understood: string;
    accepted: string;
    why: string;
    unmatched: string;
    edit: string;
    accept: string;
    start: string;
    starting: string;
    rows: {
      type: string;
      users: string;
      usersUnknown: string;
      frontend: string;
      backend: string;
      backendValue: string;
      database: string;
      auth: string;
      authRoles: string;
      authEmail: string;
      authNone: string;
      development: string;
      landing: string;
      noLanding: string;
    };
  };
  finalCta: { title: string; body: string; primary: string; secondary: string };
  footer: { tagline: string[] };
}
