"use client";

import { Button } from "@/components/ui/button";

interface SuggestionProps {
  text: string;
  actionLabel: string;
  onAccept: () => void;
}

/** Inline, non-blocking suggestion derived from what the user wrote. */
export function Suggestion({ text, actionLabel, onAccept }: SuggestionProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button size="sm" variant="outline" onClick={onAccept}>
        {actionLabel}
      </Button>
    </div>
  );
}
