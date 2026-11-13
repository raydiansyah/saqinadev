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
  };
  features: {
    file: string;
    title: string;
    intro: string;
    items: { id: string; name: string; points: string[] }[];
  };
  finalCta: { title: string; body: string; primary: string };
  footer: { tagline: string[] };
}
