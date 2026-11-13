import type { ReactNode } from "react";

/** The project's content column; pages read best at a fixed width. */
export function ProjectMain({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl">{children}</div>;
}
