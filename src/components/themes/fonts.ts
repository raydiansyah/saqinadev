import { Source_Serif_4, Space_Grotesk } from "next/font/google";

/**
 * Extra families used only by theme previews. next/font self-hosts them, so the CSP
 * (`font-src 'self' data:`) keeps holding. Monospace reuses Geist Mono from the layout.
 */
export const serifFont = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-theme-serif",
  display: "swap",
});

export const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-theme-display",
  display: "swap",
});

export const themeFontVariables = `${serifFont.variable} ${displayFont.variable}`;
