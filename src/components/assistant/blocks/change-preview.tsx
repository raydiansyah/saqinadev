import { cn } from "@/lib/utils";

/**
 * Diff-style preview: removed lines in red with "−", added lines in green with "+". Signs are
 * text, so the meaning survives without color.
 */
export function ChangePreview({
  before,
  after,
  label,
}: {
  before?: string | null;
  after: string;
  label?: string;
}) {
  const removed = before ? before.split("\n") : [];
  const added = after.split("\n");
  return (
    <pre
      aria-label={label}
      className="max-h-64 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap"
    >
      {removed.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of a fixed text
        <span key={`r${i}`} className={cn("block text-error")}>
          {`− ${line}`}
        </span>
      ))}
      {added.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of a fixed text
        <span key={`a${i}`} className="block text-success">
          {`+ ${line}`}
        </span>
      ))}
    </pre>
  );
}
