/**
 * Generated landing assets (Higgsfield), optimized copies served from /public/landing.
 * Originals stay in /design/landing-source (git-ignored). Set an entry to null and the
 * landing falls back to its code-built scene.
 */
export const LANDING_ASSETS: {
  /** Glass "project hub" object for the hero (black background, blended with screen). */
  hero: string | null;
  /** Short silent loop behind the final call to action. */
  ctaLoop: { mp4: string; webm: string; poster: string } | null;
} = {
  hero: "/landing/hero.webp",
  ctaLoop: {
    mp4: "/landing/cta-loop.mp4",
    webm: "/landing/cta-loop.webm",
    poster: "/landing/cta-poster.webp",
  },
};
