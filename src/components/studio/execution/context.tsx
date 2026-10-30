"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import {
  getExecutionDeliveryAction,
  getExecutionDiffAction,
} from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import type { DeliveryDTO, ExecutionDiffDTO } from "@/lib/executions/dto";
import { type UseExecution, useExecution } from "./use-execution";
import { type Read, useRead } from "./use-read";

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
  /** The repository's own answer about the work branch, and CI, preview and stages. Asked when a tab wants them. */
  diff: Read<ExecutionDiffDTO>;
  delivery: Read<DeliveryDTO>;
  want: (what: "diff" | "delivery") => void;
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
  const [wanted, setWanted] = useState({ diff: false, delivery: false });
  const want = useCallback(
    (what: "diff" | "delivery") => setWanted((w) => (w[what] ? w : { ...w, [what]: true })),
    [],
  );
  // What changes the answer: a new commit, news about the preview, or the execution ending.
  const execution = active.state.execution;
  const commits = execution?.artifacts.filter((a) => a.kind === "commit").length ?? 0;
  const previewNews =
    active.state.events.filter((e) => e.type.startsWith("preview.")).at(-1)?.seq ?? 0;
  const key = execution ? `${execution.id}:${commits}:${previewNews}:${execution.status}` : "";
  const diff = useRead(
    wanted.diff && execution ? () => getExecutionDiffAction(slug, execution.id) : null,
    key,
  );
  const delivery = useRead(
    wanted.delivery && execution ? () => getExecutionDeliveryAction(slug, execution.id) : null,
    key,
  );
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
      diff,
      delivery,
      want,
    }),
    [slug, activeId, active, list, onOpen, diff, delivery, want],
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
