"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The project's content column. Pages read best at a fixed width; the Studio holds a chat and a
 * work area side by side, so it gets the full width.
 */
export function ProjectMain({ slug, children }: { slug: string; children: ReactNode }) {
  const wide = usePathname().startsWith(`/project/${slug}/studio`);
  return <div className={cn("mx-auto", wide ? "max-w-none" : "max-w-5xl")}>{children}</div>;
}
