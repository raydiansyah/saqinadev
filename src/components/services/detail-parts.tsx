import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled block of the service page. Callers only render it when there is content. */
export function DetailBlock({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn("border-t border-border py-10", className)}
    >
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function BulletList({
  items,
  tone = "primary",
}: {
  items: string[];
  tone?: "primary" | "muted";
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "mt-2.5 size-1.5 shrink-0 rounded-full",
              tone === "primary" ? "bg-primary" : "bg-border-strong",
            )}
          />
          <span className="min-w-0 text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  );
}
