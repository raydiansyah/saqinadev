"use client";

import { useEffect } from "react";
import { type Chapter, chapterAt, localProgress, STORY, stepAt } from "@/content/story";
import { loadGsap, PINNED_QUERY } from "@/lib/motion/load-gsap";

interface StoryControllerProps {
  /** id of the story track element whose scroll range drives the timeline. */
  trackId: string;
}

/**
 * Maps scroll to story state: scroll → progress 0..1 → active chapter → local progress
 * and step. Writes only data attributes and one CSS variable; the visuals react in CSS.
 */
export function StoryController({ trackId }: StoryControllerProps) {
  useEffect(() => {
    const track = document.getElementById(trackId);
    if (!track) return;
    const articles = new Map<string, HTMLElement>();
    for (const el of track.querySelectorAll<HTMLElement>("[data-chapter-id]")) {
      articles.set(el.dataset.chapterId ?? "", el);
    }
    const railStops = [...track.querySelectorAll<HTMLElement>("[data-rail-stop]")];
    const nodeLabel = track.querySelector<HTMLElement>("[data-node-label]");
    const nodeLabels: Record<string, string> = JSON.parse(nodeLabel?.dataset.labels ?? "{}");
    const railOrder = railStops.map((el) => el.dataset.railStop);

    let current: Chapter | null = null;
    let currentRail: string | null = null;

    const markRail = (stop: string) => {
      if (stop === currentRail) return;
      currentRail = stop;
      const activeRail = railOrder.indexOf(stop);
      railStops.forEach((el, i) => {
        el.dataset.state = i < activeRail ? "done" : i === activeRail ? "active" : "next";
        if (i === activeRail) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
      });
    };

    const activate = (chapter: Chapter) => {
      for (const [id, el] of articles) {
        el.toggleAttribute("data-active", id === chapter.id);
      }
      const nodeText = nodeLabels[chapter.node] ?? chapter.node;
      if (nodeLabel && nodeLabel.textContent !== nodeText) {
        nodeLabel.textContent = nodeText;
        nodeLabel.animate?.(
          [
            { opacity: 0, transform: "translateY(6px) scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 320, easing: "ease-out" },
        );
      }
    };

    const apply = (progress: number) => {
      const chapter = chapterAt(progress);
      if (chapter !== current) {
        current = chapter;
        activate(chapter);
      }
      const el = articles.get(chapter.id);
      if (!el) return;
      const local = localProgress(chapter, progress);
      el.style.setProperty("--p", local.toFixed(3));
      const step = stepAt(chapter, local);
      el.dataset.step = String(step);
      markRail(chapter.railSteps?.[step] ?? chapter.rail);
    };

    // Back to the stacked composition: every visual shows its final state.
    const reset = () => {
      current = null;
      currentRail = null;
      for (const el of articles.values()) {
        el.style.removeProperty("--p");
        delete el.dataset.step;
      }
    };

    const media = window.matchMedia(PINNED_QUERY);

    const scrollToChapter = (id: string | undefined) => {
      const chapter = STORY.find((c) => c.id === id);
      if (!chapter) return false;
      const distance = track.offsetHeight - window.innerHeight;
      const top = track.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + chapter.range[0] * distance + 2, behavior: "smooth" });
      return true;
    };

    // Rail buttons and story links (e.g. "Agents" in the navbar) jump to a chapter.
    // When the story is not pinned, links fall back to their normal anchors.
    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-rail-target], a[data-story-target]",
      );
      if (!el) return;
      const id = el.dataset.railTarget ?? el.dataset.storyTarget;
      if (el.tagName === "A" && !media.matches) return;
      if (scrollToChapter(id)) event.preventDefault();
    };
    document.addEventListener("click", onClick);
    let teardown: (() => void) | null = null;
    let disposed = false;

    const setup = async () => {
      teardown?.();
      teardown = null;
      if (!media.matches) {
        reset();
        return;
      }
      const { gsap } = await loadGsap();
      if (disposed || !media.matches) return;
      // A proxy tweened with a short scrub smooths wheel jumps without lagging behind.
      const state = { progress: 0 };
      const tween = gsap.to(state, {
        progress: 1,
        ease: "none",
        scrollTrigger: { trigger: track, start: "top top", end: "bottom bottom", scrub: 0.35 },
        onUpdate: () => apply(state.progress),
      });
      apply(tween.scrollTrigger?.progress ?? 0);
      teardown = () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    };

    setup();
    media.addEventListener("change", setup);
    return () => {
      disposed = true;
      teardown?.();
      media.removeEventListener("change", setup);
      document.removeEventListener("click", onClick);
    };
  }, [trackId]);

  return null;
}
