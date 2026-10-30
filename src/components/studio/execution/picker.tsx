"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { FIELD_CLASS } from "@/components/ui/form";
import { useExecutionContext } from "./context";

/** Which execution the tabs show, when the project has had more than one. */
export function ExecutionPicker() {
  const t = useTranslations("studio.execution");
  const status = useTranslations("studio.execution.status");
  const id = useId();
  const { list, activeId, setActiveId, active } = useExecutionContext();
  if (list.length < 2) return null;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-xs text-muted-foreground">
        {t("pick")}
      </label>
      <select
        id={id}
        value={activeId ?? ""}
        onChange={(e) => setActiveId(e.target.value)}
        className={`${FIELD_CLASS} min-h-11 py-1.5 text-sm`}
      >
        {list.map((e) => {
          // The one on screen shows what the server says now; the others, what it said when the page loaded.
          const now = e.id === activeId ? (active.state.execution?.status ?? e.status) : e.status;
          return (
            <option key={e.id} value={e.id}>
              {e.request.slice(0, 48)} · {status.has(now as never) ? status(now as never) : now}
            </option>
          );
        })}
      </select>
    </div>
  );
}
