/**
 * GSAP is only needed for the pinned story on large screens. Loading it on demand keeps
 * it out of the initial bundle and away from phones and reduced-motion users entirely.
 */
let pending: Promise<{
  gsap: typeof import("gsap").gsap;
  ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
}> | null = null;

export function loadGsap() {
  pending ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
    ([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    },
  );
  return pending;
}

/** Same condition as the `pinned` CSS variant in globals.css. */
export const PINNED_QUERY = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";
