"use client";

import { useCallback, useEffect, useState } from "react";
import { chatContextOptionsAction } from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import type { ChatContextOptions } from "@/lib/assistant/chat-context";

/** What this person added from Browse for this project: skill slugs and connector ids. */
export interface Yours {
  skills: string[];
  connectors: string[];
}

export const NO_YOURS: Yours = { skills: [], connectors: [] };
const KEY = (slug: string) => `saqina.chatYours.${slug}`;

/**
 * "Yours" is a per-browser convenience, like the chosen mode: it only narrows what the menu
 * lists. What a message may use is still checked on the server against the switched-on skills
 * and the connectors this project can reach.
 */
export function useYours(slug: string): [Yours, (next: Yours) => void] {
  const [yours, setYours] = useState<Yours>(NO_YOURS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY(slug)) ?? "null") as Partial<Yours> | null;
      const list = (v: unknown) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
      if (saved) setYours({ skills: list(saved.skills), connectors: list(saved.connectors) });
    } catch {
      // Unreadable or blocked storage: start empty.
    }
  }, [slug]);
  return [
    yours,
    (next) => {
      setYours(next);
      try {
        localStorage.setItem(KEY(slug), JSON.stringify(next));
      } catch {
        // Not saved; it still works for this visit.
      }
    },
  ];
}

/** Skills and connectors this project can offer, fetched once the first time a menu opens. */
export function useContextOptions(slug: string) {
  const [options, setOptions] = useState<ChatContextOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!asked || options) return;
    void chatContextOptionsAction(slug).then((r) => {
      if (r.ok) {
        setOptions(r.data);
        setFailed(false);
      } else setFailed(true);
    });
  }, [asked, options, slug]);

  return {
    options,
    failed,
    load: useCallback(() => {
      setFailed(false);
      setAsked(true);
    }, []),
  };
}
