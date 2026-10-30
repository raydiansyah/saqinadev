"use client";

import { cn } from "@/lib/utils";

/**
 * A unified diff, line by line. Added and removed lines carry their + and - sign as well as a
 * colour, so the meaning does not depend on seeing the colour. Long lines scroll, they do not wrap.
 */
export function DiffView({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-xs leading-relaxed">
      {lines.map((line, i) => (
        <span
          // The same line can appear twice in a patch; its place in the patch is what tells them apart.
          // biome-ignore lint/suspicious/noArrayIndexKey: a patch is a fixed list
          key={i}
          className={cn(
            "block whitespace-pre",
            line.startsWith("+") && !line.startsWith("+++") && "bg-success/10 text-success",
            line.startsWith("-") && !line.startsWith("---") && "bg-error/10 text-error",
            line.startsWith("@@") && "text-info",
            (line.startsWith("diff ") ||
              line.startsWith("index ") ||
              line.startsWith("+++") ||
              line.startsWith("---")) &&
              "text-subtle-foreground",
          )}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
}
