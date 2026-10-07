"use client";

import { useEffect } from "react";

/**
 * One observer for every `[data-reveal]` element on the page, so sections stay
 * Server Components. Content is visible in the HTML; only elements still below the
 * fold are hidden and revealed, and nothing moves under prefers-reduced-motion.
 */
export function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal", "shown");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (el.getBoundingClientRect().top < window.innerHeight) continue;
      el.setAttribute("data-reveal", "pending");
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return null;
}
