import { cn } from "@/lib/utils";

/**
 * Text wordmark placeholder until a real logo exists. The fork glyph mirrors the
 * product idea: one project, two ways to build it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5 text-primary" fill="none">
        <path
          d="M10 2v5M10 7 4 13v5M10 7l6 6v5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="10" cy="7" r="1.75" fill="currentColor" />
      </svg>
      <span>
        Saqina<span className="text-muted-foreground">.dev</span>
      </span>
    </span>
  );
}
