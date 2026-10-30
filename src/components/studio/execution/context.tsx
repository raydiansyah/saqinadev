"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { type UseExecution, useExecution } from "./use-execution";

export interface ExecutionListItem {
  id: string;
  mode: "plan" | "build";
  status: string;
  request: string;
  createdAt: string;
}

interface Value {
  slug: string;
  /** The execution the work area shows, or null before any was started. */
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Same copy for every tab and for the card in the chat: one source, not one per panel. */
  active: UseExecution;
  list: ExecutionListItem[];
  /** Adds a just-started execution to the list and shows it. */
  register: (item: ExecutionListItem) => void;
  /** Shows an execution in the work area (the card in the chat calls this). */
  open: (id: string) => void;
}

const Ctx = createContext<Value | null>(null);

export function ExecutionProvider({
  slug,
  list: initial,
  onOpen,
  children,
}: {
  slug: string;
  list: ExecutionListItem[];
  /** Called when an execution is shown on purpose, so the shell can turn to the right tab. */
  onOpen?: (id: string) => void;
  children: ReactNode;
}) {
  const [list, setList] = useState(initial);
  const first = initial.find((e) => !["succeeded", "failed", "cancelled"].includes(e.status));
  const [activeId, setActiveId] = useState<string | null>(first?.id ?? initial[0]?.id ?? null);
  const active = useExecution(slug, activeId, true);
  const value = useMemo(
    () => ({
      slug,
      activeId,
      setActiveId,
      active,
      list,
      register: (item: ExecutionListItem) => {
        setList((l) => [item, ...l.filter((x) => x.id !== item.id)]);
        setActiveId(item.id);
      },
      open: (id: string) => {
        setActiveId(id);
        onOpen?.(id);
      },
    }),
    [slug, activeId, active, list, onOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExecutionContext(): Value {
  const value = useContext(Ctx);
  if (!value) throw new Error("ExecutionProvider is missing");
  return value;
}

/** For places that also exist outside the Studio (the chat in a side sheet). */
export function useOptionalExecutionContext(): Value | null {
  return useContext(Ctx);
}
