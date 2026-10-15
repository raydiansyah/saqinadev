"use client";

import { useLocale } from "next-intl";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { CAPTCHA_HEADER } from "@/lib/captcha/config";

/**
 * Cloudflare Turnstile widget for public forms. The site key is public; it is only read when
 * running a production build, so local development never loads Cloudflare at all.
 */

const SITE_KEY =
  process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : undefined;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark" | "light" | "auto";
      size: "normal" | "compact" | "flexible";
      language: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing"));
    script.onerror = () => {
      loader = null; // allow a retry on the next form mount
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

export interface Captcha {
  /** False on local and test builds: forms then skip the check entirely. */
  enabled: boolean;
  /** Current single-use token, or null until the visitor passes the check. */
  token: string | null;
  /** Request headers for Better Auth calls. */
  headers: Record<string, string>;
  /** Tokens are single use: call after every submit, successful or not. */
  reset: () => void;
  /** Render inside the form. Renders nothing when disabled. */
  widget: ReactNode;
}

export function useCaptcha(): Captcha {
  const locale = useLocale();
  const enabled = Boolean(SITE_KEY);
  const [token, setToken] = useState<string | null>(null);
  // State, not a ref object: a form that swaps its widget out (success view) must re-render it.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !container) return;
    const el = container;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId.current = api.render(el, {
          sitekey: SITE_KEY,
          theme: "dark",
          // The compact widget is 150px; the normal one needs 300px.
          size: el.clientWidth < 300 ? "compact" : "flexible",
          language: locale,
          callback: setToken,
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => setToken(null));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [container, locale]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  return {
    enabled,
    token,
    headers: token ? { [CAPTCHA_HEADER]: token } : {},
    reset,
    widget: enabled ? <div ref={setContainer} className="min-h-16" /> : null,
  };
}
