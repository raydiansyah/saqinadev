import type { CSSProperties } from "react";
import {
  THEME_TOKENS,
  type ThemeShadow,
  type ThemeTokens,
  themeChart,
  themeStatus,
  type UiThemeId,
} from "@/content/ui-themes";
import { cn } from "@/lib/utils";
import { themeFontVariables } from "./fonts";

const FONT_FAMILY: Record<ThemeTokens["font"], string> = {
  sans: "var(--font-sans)",
  serif: "var(--font-theme-serif), Georgia, serif",
  mono: "var(--font-mono)",
  display: "var(--font-theme-display), var(--font-sans)",
};

const SHADOW: Record<ThemeShadow, string> = {
  none: "none",
  soft: "0 8px 24px rgb(0 0 0 / 0.16)",
  hard: "4px 4px 0 var(--foreground)",
  inset:
    "inset -4px -4px 8px rgb(0 0 0 / 0.12), inset 4px 4px 8px rgb(255 255 255 / 0.7), 0 6px 14px rgb(0 0 0 / 0.12)",
};

/**
 * Overrides the app tokens on one subtree. Same variable names as `:root`, so the utility
 * classes (`bg-background`, `text-foreground`, ...) work unchanged inside a preview.
 */
export function themeStyle(tokens: ThemeTokens, theme?: UiThemeId): CSSProperties {
  const status = theme ? themeStatus(theme) : undefined;
  return {
    ...(status
      ? {
          "--theme-success": status.success,
          "--theme-warning": status.warning,
          "--theme-error": status.error,
          "--theme-info": status.info,
        }
      : {}),
    "--background": tokens.background,
    "--surface": tokens.surface,
    "--surface-raised": tokens.surface,
    "--foreground": tokens.foreground,
    "--muted-foreground": tokens.mutedForeground,
    "--subtle-foreground": tokens.mutedForeground,
    "--border": tokens.border,
    "--border-strong": tokens.border,
    "--primary": tokens.primary,
    "--primary-foreground": tokens.primaryForeground,
    "--ring": tokens.primary,
    "--theme-accent": tokens.accent,
    colorScheme: tokens.scheme,
    fontFamily: FONT_FAMILY[tokens.font],
  } as CSSProperties;
}

interface ThemePreviewProps {
  theme: UiThemeId;
  /** Smaller mock for pickers; the full mock is used on the gallery. */
  compact?: boolean;
  /** "dashboard" draws a data screen: sidebar, status cards, chart and table. */
  variant?: "page" | "dashboard";
  className?: string;
}

/**
 * A tiny mock screen drawn with the theme's own tokens. It carries no readable copy, so it
 * needs no translation and is hidden from assistive technology; the card around it names the
 * theme in text.
 */
function DashboardMock({ theme, tokens }: { theme: UiThemeId; tokens: ThemeTokens }) {
  const chart = themeChart(theme);
  const heights = [45, 70, 55, 90];
  const cards = ["--theme-success", "--theme-warning", "--theme-error"];
  const box: CSSProperties = {
    borderWidth: tokens.borderWidth,
    borderRadius: tokens.radius,
    boxShadow: SHADOW[tokens.shadow],
  };
  return (
    <div className="grid grid-cols-[2.25rem_1fr] gap-3">
      <div className="flex flex-col gap-2 border-r border-border pr-2">
        <span className="block size-4 bg-primary" style={{ borderRadius: tokens.radius / 2 }} />
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("block h-1.5 bg-muted-foreground/60", i === 0 && "bg-primary")}
          />
        ))}
      </div>
      <div className="min-w-0 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {cards.map((color) => (
            <div key={color} className="border-border bg-surface p-2" style={box}>
              <span className="text-base font-semibold leading-none">12</span>
              <span
                className="mt-1.5 block h-1.5 w-3/4"
                style={{ background: `var(${color})`, borderRadius: 2 }}
              />
            </div>
          ))}
        </div>
        <div className="flex h-14 items-end gap-1.5 border-border bg-surface p-2" style={box}>
          {heights.map((h, i) => (
            <span
              key={h}
              className="block flex-1"
              style={{ height: `${h}%`, background: chart[i % chart.length], borderRadius: 2 }}
            />
          ))}
        </div>
        <div
          className="divide-y divide-border border border-border bg-surface"
          style={{ borderRadius: tokens.radius }}
        >
          {cards.map((color) => (
            <div key={color} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="block h-1.5 w-1/2 bg-muted-foreground/60" />
              <span
                className="block h-2 w-6"
                style={{ background: `var(${color})`, borderRadius: tokens.radius }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ThemePreview({
  theme,
  compact = false,
  variant = "page",
  className,
}: ThemePreviewProps) {
  const tokens = THEME_TOKENS[theme];
  const frame: CSSProperties = {
    borderWidth: tokens.borderWidth,
    borderRadius: tokens.radius,
    boxShadow: SHADOW[tokens.shadow],
  };
  const control: CSSProperties = {
    borderWidth: tokens.borderWidth,
    borderRadius: Math.min(tokens.radius, 999),
  };

  return (
    <div
      aria-hidden="true"
      data-theme={theme}
      style={themeStyle(tokens, theme)}
      className={cn(
        themeFontVariables,
        "overflow-hidden border border-border bg-background text-foreground",
        compact ? "w-28 rounded-md p-2" : "w-full rounded-lg p-4",
        className,
      )}
    >
      {variant === "dashboard" && !compact ? (
        <DashboardMock theme={theme} tokens={tokens} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn("block bg-primary", compact ? "size-2.5" : "size-4")}
              style={{ borderRadius: tokens.radius / 2 }}
            />
            <span className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn("block bg-muted-foreground/60", compact ? "h-1 w-3" : "h-1.5 w-6")}
                />
              ))}
            </span>
          </div>

          <p className={cn("mt-3 font-semibold leading-none", compact ? "text-xl" : "text-4xl")}>
            Aa
          </p>
          <span
            className={cn(
              "mt-2 block bg-muted-foreground/60",
              compact ? "h-1 w-3/4" : "h-1.5 w-2/3",
            )}
          />

          <div className={cn("flex gap-2", compact ? "mt-2" : "mt-4")}>
            <span
              className={cn(
                "flex items-center justify-center border-primary bg-primary text-primary-foreground",
                compact ? "h-4 w-9 text-[8px]" : "h-8 w-20 text-xs",
              )}
              style={control}
            >
              Aa
            </span>
            <span
              className={cn(
                "flex items-center justify-center border-border bg-transparent",
                compact ? "h-4 w-9 text-[8px]" : "h-8 w-20 text-xs",
              )}
              style={control}
            >
              Aa
            </span>
          </div>

          {compact ? null : (
            <div className="mt-4 border-border bg-surface p-3" style={frame}>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-semibold leading-none">123</span>
                <span
                  className="block h-6 w-6"
                  style={{ background: "var(--theme-accent)", borderRadius: tokens.radius / 2 }}
                />
              </div>
              <span className="mt-2 block h-1.5 w-1/2 bg-muted-foreground/60" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
