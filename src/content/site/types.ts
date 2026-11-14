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
    /** Documents floating around the hero object in the 3D scene. */
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
    items: { id: "project" | "portal" | "brand"; name: string; points: string[] }[];
    orbit: string[];
    portal: { label: string; value: string; due: string };
    brand: { name: string; credit: string };
  };
  demo: {
    file: string;
    title: string;
    body: string;
    clientLabel: string;
    clientPlaceholder: string;
    amountLabel: string;
    amountError: string;
    invoice: string;
    receipt: string;
    sent: string;
    paid: string;
    record: string;
    reset: string;
    words: string;
    waiting: string;
    note: string;
  };
  features: {
    file: string;
    title: string;
    intro: string;
    items: { id: string; name: string; points: string[] }[];
  };
  finalCta: { title: string; body: string; primary: string; secondary: string };
  footer: { tagline: string[] };
}
