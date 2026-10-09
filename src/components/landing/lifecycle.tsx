"use client";

import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/primitives/container";
import type { SiteContent } from "@/content/site";
import { cn } from "@/lib/utils";

const STEP_MS = 2600;

/**
 * The project lifecycle in one row. Steps advance on their own while the section is visible
 * (never with reduced motion); visitors can pause, or pick a step to read its point.
 */
export function Lifecycle({ content }: { content: SiteContent["lifecycle"] }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const root = useRef<HTMLElement>(null);
  const count = content.steps.length;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible || reduced) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % count), STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, visible, reduced, count]);

  const step = content.steps[active];
  const progress = (active / (count - 1)) * 100;

  return (
    <section
      ref={root}
      id="how-it-works"
      aria-labelledby="lifecycle-heading"
      className="border-t border-border py-16 sm:py-24"
    >
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.8125rem] text-primary">{content.file}</p>
            <h2
              id="lifecycle-heading"
              className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              {content.title}
            </h2>
          </div>
          {reduced ? null : (
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={!playing}
              className="min-h-11 rounded-md border border-border px-4 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {playing ? content.pause : content.play}
            </button>
          )}
        </div>

        <div className="relative mt-10">
          {/* Track behind the steps; fills up to the active step on wide screens. */}
          <div
            aria-hidden="true"
            className="absolute top-4 right-[5.5%] left-[5.5%] hidden h-px bg-border lg:block"
          >
            <div
              className="h-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ol className="relative grid grid-cols-3 gap-y-6 sm:grid-cols-5 lg:grid-cols-9">
            {content.steps.map((s, i) => (
              <li key={s.name} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setActive(i);
                    setPlaying(false);
                  }}
                  aria-current={i === active ? "step" : undefined}
                  className="group flex min-h-11 flex-col items-center gap-2 px-1 text-center"
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full border font-mono text-xs transition-all duration-500",
                      i === active
                        ? "scale-110 border-primary bg-primary text-primary-foreground"
                        : i < active
                          ? "border-primary/70 bg-background text-primary"
                          : "border-border bg-background text-muted-foreground group-hover:border-border-strong",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-xs transition-colors sm:text-sm",
                      i === active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.name}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <p
          key={active}
          // Announce only steps the visitor picked, not the automatic advance.
          aria-live={playing && !reduced ? "off" : "polite"}
          className="mx-auto mt-10 max-w-xl rounded-lg border border-border bg-surface px-6 py-5 text-center text-lg [animation:node-morph_420ms_ease-out_both] motion-reduce:animate-none"
        >
          <span className="font-semibold">{step.name}.</span>{" "}
          <span className="text-muted-foreground">{step.point}</span>
        </p>
      </Container>
    </section>
  );
}
