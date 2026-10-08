"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Announced politely so screen reader users hear "Saved" without losing their place. */
export function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  const t = useTranslations("app.states");
  const label =
    state === "saving"
      ? t("saving")
      : state === "saved"
        ? t("saved")
        : state === "dirty"
          ? t("unsaved")
          : state === "error"
            ? t("saveFailed")
            : "";
  return (
    <p
      aria-live="polite"
      className={cn(
        "min-h-5 font-mono text-xs transition-colors",
        state === "saved" && "text-success",
        state === "error" && "text-error",
        (state === "saving" || state === "dirty") && "text-muted-foreground",
        className,
      )}
    >
      {state === "saved" ? "✓ " : ""}
      {label}
    </p>
  );
}
