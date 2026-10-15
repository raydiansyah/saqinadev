"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ConflictDialog } from "./conflict-dialog";

export type SyncState = "synced" | "pending_pr" | "conflict" | "remote_missing" | "excluded";

export interface DocSyncInfo {
  documentId: string;
  state: SyncState;
  path: string;
}

const TONE: Record<SyncState, string> = {
  synced: "border-success/40 text-success",
  pending_pr: "border-info/40 text-info",
  conflict: "border-warning/50 text-warning",
  remote_missing: "border-warning/50 text-warning",
  excluded: "border-border text-muted-foreground",
};

/**
 * Small per-document sync badge. For a conflict or a removed file, people who can write get a
 * button that opens the resolve dialog; everyone else sees the badge only.
 */
export function SyncBadge({
  projectSlug,
  docSlug,
  sync,
  saqinaText,
  canResolve,
}: {
  projectSlug: string;
  docSlug: string;
  sync: DocSyncInfo;
  /** Current Saqina text; only needed when the badge can open the dialog. */
  saqinaText: string;
  canResolve: boolean;
}) {
  const t = useTranslations("documents");
  const [open, setOpen] = useState(false);
  const label = t(`sync.badge.${sync.state}`);
  const hint = `${t(`sync.hint.${sync.state}`)} ${t("sync.path", { path: sync.path })}`;
  const className = cn(
    "inline-flex max-w-full items-center rounded-sm border px-1.5 py-0.5 text-xs",
    TONE[sync.state],
  );
  const resolvable = canResolve && (sync.state === "conflict" || sync.state === "remote_missing");

  if (!resolvable) {
    return (
      <span className={className} title={hint} role="img" aria-label={`${label}. ${hint}`}>
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        title={hint}
        aria-label={`${label}. ${hint}`}
        onClick={() => setOpen(true)}
        className={cn(
          className,
          "min-h-8 cursor-pointer underline underline-offset-4 hover:bg-surface-raised",
        )}
      >
        {label}
      </button>
      <ConflictDialog
        open={open}
        onClose={() => setOpen(false)}
        projectSlug={projectSlug}
        documentId={sync.documentId}
        docSlug={docSlug}
        kind={sync.state === "conflict" ? "conflict" : "remote_missing"}
        saqina={saqinaText}
        path={sync.path}
      />
    </>
  );
}
