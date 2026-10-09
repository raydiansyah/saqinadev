import type { ReactNode } from "react";

/** Horizontally scrollable table shell so wide rows never overflow a phone screen. */
export function DataTable({
  caption,
  head,
  children,
}: {
  caption: string;
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-surface text-xs text-muted-foreground">
          {head}
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export const TH = "px-3 py-2.5 font-medium whitespace-nowrap";
export const TD = "px-3 py-3 align-top";
