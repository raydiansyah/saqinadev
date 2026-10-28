/** The 21 UI design themes the interview can recommend from. Names live in engine copy. */

export const UI_THEMES = [
  "software",
  "modern-dark",
  "financial",
  "professional",
  "swiss-minimalist",
  "monochrome",
  "bauhaus",
  "art-deco",
  "industrial",
  "luxury",
  "newsprint",
  "claymorphism",
  "kinetic",
  "botanical",
  "organic",
  "cyberpunk",
  "terminal",
  "neo-brutalism",
  "playful-geometric",
  "sketch",
  "retro",
] as const;

export type UiThemeId = (typeof UI_THEMES)[number];

/** Groups used by the recommendation engine, the picker and the public gallery. */
export const THEME_CATEGORIES = [
  { id: "saas", themes: ["software", "modern-dark", "financial", "professional"] },
  {
    id: "minimal",
    themes: ["swiss-minimalist", "monochrome", "bauhaus", "art-deco", "industrial"],
  },
  { id: "media", themes: ["luxury", "newsprint", "claymorphism", "kinetic"] },
  { id: "organic", themes: ["botanical", "organic"] },
  {
    id: "creative",
    themes: ["cyberpunk", "terminal", "neo-brutalism", "playful-geometric", "sketch", "retro"],
  },
] as const satisfies readonly { id: string; themes: readonly UiThemeId[] }[];

export type ThemeCategoryId = (typeof THEME_CATEGORIES)[number]["id"];

/**
 * recommended: safe for daily work screens, recommended automatically.
 * available: readable and calm, offered but never forced.
 * concept: expressive, only on explicit choice; needs extra accessibility care.
 */
export const THEME_TIERS = ["recommended", "available", "concept"] as const;
export type ThemeTier = (typeof THEME_TIERS)[number];

export const THEME_TIER: Record<UiThemeId, ThemeTier> = {
  "modern-dark": "recommended",
  software: "recommended",
  professional: "recommended",
  "swiss-minimalist": "recommended",
  financial: "recommended",
  monochrome: "available",
  botanical: "available",
  luxury: "available",
  newsprint: "available",
  organic: "available",
  bauhaus: "available",
  industrial: "available",
  "art-deco": "concept",
  claymorphism: "concept",
  kinetic: "concept",
  cyberpunk: "concept",
  terminal: "concept",
  "neo-brutalism": "concept",
  "playful-geometric": "concept",
  sketch: "concept",
  retro: "concept",
};

export type ThemeShadow = "none" | "soft" | "hard" | "inset";
export type ThemeFont = "sans" | "serif" | "mono" | "display";

/** Plain data: the preview turns it into CSS variables, so no second style system exists. */
export interface ThemeTokens {
  scheme: "light" | "dark";
  background: string;
  surface: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  radius: number;
  borderWidth: number;
  shadow: ThemeShadow;
  font: ThemeFont;
}

export const THEME_TOKENS: Record<UiThemeId, ThemeTokens> = {
  software: {
    scheme: "light",
    background: "#fafbff",
    surface: "#ffffff",
    foreground: "#0b1220",
    mutedForeground: "#4a5568",
    border: "#d6dcec",
    primary: "#1d4ed8",
    primaryForeground: "#ffffff",
    accent: "#0b1220",
    radius: 8,
    borderWidth: 1,
    shadow: "soft",
    font: "sans",
  },
  "modern-dark": {
    scheme: "dark",
    background: "#0b0d12",
    surface: "#141821",
    foreground: "#f1f3f9",
    mutedForeground: "#a3abbd",
    border: "#262c3a",
    primary: "#7c8cff",
    primaryForeground: "#0b0d12",
    accent: "#38e0c0",
    radius: 10,
    borderWidth: 1,
    shadow: "soft",
    font: "sans",
  },
  financial: {
    scheme: "dark",
    background: "#06140f",
    surface: "#0d221a",
    foreground: "#eaf6ef",
    mutedForeground: "#9cb8a9",
    border: "#1f3d30",
    primary: "#34d399",
    primaryForeground: "#04130d",
    accent: "#f5c451",
    radius: 6,
    borderWidth: 1,
    shadow: "none",
    font: "mono",
  },
  professional: {
    scheme: "light",
    background: "#f6f7f9",
    surface: "#ffffff",
    foreground: "#14213d",
    mutedForeground: "#50586b",
    border: "#d3d8e0",
    primary: "#14397a",
    primaryForeground: "#ffffff",
    accent: "#8a6d1d",
    radius: 4,
    borderWidth: 1,
    shadow: "none",
    font: "serif",
  },
  "swiss-minimalist": {
    scheme: "light",
    background: "#ffffff",
    surface: "#f2f2f2",
    foreground: "#111111",
    mutedForeground: "#555555",
    border: "#111111",
    primary: "#d90000",
    primaryForeground: "#ffffff",
    accent: "#111111",
    radius: 0,
    borderWidth: 1,
    shadow: "none",
    font: "sans",
  },
  monochrome: {
    scheme: "light",
    background: "#ffffff",
    surface: "#f5f5f5",
    foreground: "#000000",
    mutedForeground: "#4d4d4d",
    border: "#000000",
    primary: "#000000",
    primaryForeground: "#ffffff",
    accent: "#000000",
    radius: 0,
    borderWidth: 1,
    shadow: "none",
    font: "mono",
  },
  bauhaus: {
    scheme: "light",
    background: "#f4efe3",
    surface: "#ffffff",
    foreground: "#111111",
    mutedForeground: "#4a4a4a",
    border: "#111111",
    primary: "#c8102e",
    primaryForeground: "#ffffff",
    accent: "#0b4fa8",
    radius: 0,
    borderWidth: 3,
    shadow: "hard",
    font: "display",
  },
  "art-deco": {
    scheme: "dark",
    background: "#0e0b08",
    surface: "#1a140d",
    foreground: "#f5e9c8",
    mutedForeground: "#bfae85",
    border: "#8c6d2c",
    primary: "#d4af37",
    primaryForeground: "#120d05",
    accent: "#0f766e",
    radius: 0,
    borderWidth: 2,
    shadow: "none",
    font: "serif",
  },
  industrial: {
    scheme: "dark",
    background: "#1b1d1f",
    surface: "#26292c",
    foreground: "#e6e8ea",
    mutedForeground: "#a5abb0",
    border: "#4a4f54",
    primary: "#ffb000",
    primaryForeground: "#1b1d1f",
    accent: "#9aa4ad",
    radius: 2,
    borderWidth: 2,
    shadow: "none",
    font: "mono",
  },
  luxury: {
    scheme: "light",
    background: "#faf7f2",
    surface: "#ffffff",
    foreground: "#1a1612",
    mutedForeground: "#5c544b",
    border: "#e3dccf",
    primary: "#1a1612",
    primaryForeground: "#faf7f2",
    accent: "#8c6a2f",
    radius: 0,
    borderWidth: 1,
    shadow: "none",
    font: "serif",
  },
  newsprint: {
    scheme: "light",
    background: "#f1e9d6",
    surface: "#f8f2e3",
    foreground: "#1b1a17",
    mutedForeground: "#4f4a3f",
    border: "#1b1a17",
    primary: "#8b1a1a",
    primaryForeground: "#f8f2e3",
    accent: "#1b1a17",
    radius: 0,
    borderWidth: 1,
    shadow: "none",
    font: "serif",
  },
  claymorphism: {
    scheme: "light",
    background: "#fdeef4",
    surface: "#ffffff",
    foreground: "#3a2342",
    mutedForeground: "#6b4f73",
    border: "#f3c9dc",
    primary: "#7c3aed",
    primaryForeground: "#ffffff",
    accent: "#be185d",
    radius: 24,
    borderWidth: 0,
    shadow: "inset",
    font: "sans",
  },
  kinetic: {
    scheme: "dark",
    background: "#050505",
    surface: "#111111",
    foreground: "#ffffff",
    mutedForeground: "#b3b3b3",
    border: "#2b2b2b",
    primary: "#c6ff1a",
    primaryForeground: "#050505",
    accent: "#ff3d00",
    radius: 0,
    borderWidth: 1,
    shadow: "none",
    font: "display",
  },
  botanical: {
    scheme: "light",
    background: "#f3f6ef",
    surface: "#ffffff",
    foreground: "#1f2d22",
    mutedForeground: "#4c5f50",
    border: "#cfdac8",
    primary: "#3d6b49",
    primaryForeground: "#ffffff",
    accent: "#a67c52",
    radius: 14,
    borderWidth: 1,
    shadow: "soft",
    font: "serif",
  },
  organic: {
    scheme: "light",
    background: "#f6ede1",
    surface: "#fffaf2",
    foreground: "#3a2a1c",
    mutedForeground: "#6a5440",
    border: "#dcc7ab",
    primary: "#9a4a22",
    primaryForeground: "#fffaf2",
    accent: "#6b7d3a",
    radius: 28,
    borderWidth: 1,
    shadow: "soft",
    font: "serif",
  },
  cyberpunk: {
    scheme: "dark",
    background: "#08040f",
    surface: "#130a22",
    foreground: "#f4eaff",
    mutedForeground: "#b9a6d6",
    border: "#5b2a9e",
    primary: "#00f0ff",
    primaryForeground: "#06020d",
    accent: "#ff2bd6",
    radius: 0,
    borderWidth: 1,
    shadow: "none",
    font: "mono",
  },
  terminal: {
    scheme: "dark",
    background: "#000000",
    surface: "#0a0f0a",
    foreground: "#33ff66",
    mutedForeground: "#2fbf55",
    border: "#1c7a35",
    primary: "#33ff66",
    primaryForeground: "#000000",
    accent: "#e6e6e6",
    radius: 0,
    borderWidth: 1,
    shadow: "none",
    font: "mono",
  },
  "neo-brutalism": {
    scheme: "light",
    background: "#fff6c9",
    surface: "#ffffff",
    foreground: "#000000",
    mutedForeground: "#333333",
    border: "#000000",
    primary: "#cf1f5a",
    primaryForeground: "#ffffff",
    accent: "#0b7a4b",
    radius: 0,
    borderWidth: 3,
    shadow: "hard",
    font: "display",
  },
  "playful-geometric": {
    scheme: "light",
    background: "#fffbf0",
    surface: "#ffffff",
    foreground: "#1d1b3a",
    mutedForeground: "#4a4770",
    border: "#1d1b3a",
    primary: "#c21f2e",
    primaryForeground: "#ffffff",
    accent: "#2a9d8f",
    radius: 16,
    borderWidth: 2,
    shadow: "hard",
    font: "display",
  },
  sketch: {
    scheme: "light",
    background: "#fdfdf8",
    surface: "#ffffff",
    foreground: "#222222",
    mutedForeground: "#555555",
    border: "#222222",
    primary: "#1e40af",
    primaryForeground: "#ffffff",
    accent: "#222222",
    radius: 6,
    borderWidth: 2,
    shadow: "none",
    font: "display",
  },
  retro: {
    scheme: "light",
    background: "#f2e2c0",
    surface: "#fbf1d8",
    foreground: "#3b2314",
    mutedForeground: "#6a4a30",
    border: "#8a5a2b",
    primary: "#a8500f",
    primaryForeground: "#fff7e6",
    accent: "#5e6b2f",
    radius: 8,
    borderWidth: 2,
    shadow: "hard",
    font: "display",
  },
};

export interface ThemeStatusColors {
  success: string;
  warning: string;
  error: string;
  info: string;
}

/** Status colours for text and icons on the theme's surfaces; shared per colour scheme. */
const STATUS: Record<ThemeTokens["scheme"], ThemeStatusColors> = {
  light: { success: "#166534", warning: "#92400e", error: "#b91c1c", info: "#1d4ed8" },
  dark: { success: "#4ade80", warning: "#fbbf24", error: "#f87171", info: "#7dd3fc" },
};

export function themeStatus(id: UiThemeId): ThemeStatusColors {
  return STATUS[THEME_TOKENS[id].scheme];
}

/** Series colours for charts. Themes without distinct primary and accent override them. */
const CHART_OVERRIDE: Partial<Record<UiThemeId, string[]>> = {
  software: ["#1d4ed8", "#0f766e", "#92400e", "#0b1220"],
  monochrome: ["#000000", "#4d4d4d", "#737373"],
  terminal: ["#33ff66", "#e6e6e6", "#2fbf55"],
  "swiss-minimalist": ["#d90000", "#111111", "#555555"],
  sketch: ["#1e40af", "#222222", "#555555"],
};

export function themeChart(id: UiThemeId): string[] {
  const t = THEME_TOKENS[id];
  const status = themeStatus(id);
  return CHART_OVERRIDE[id] ?? [t.primary, t.accent, status.info, status.warning];
}

export function isTheme(id: string): id is UiThemeId {
  return (UI_THEMES as readonly string[]).includes(id);
}

export function themeCategoryOf(id: UiThemeId) {
  return THEME_CATEGORIES.find((c) => (c.themes as readonly UiThemeId[]).includes(id));
}
