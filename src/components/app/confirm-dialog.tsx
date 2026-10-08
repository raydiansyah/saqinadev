"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "./dialog";

/**
 * Explicit confirmation for destructive actions. With `confirmText`, the confirm button
 * stays disabled until the user types it exactly (used for deleting a project).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmText,
  confirmTextLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmText?: string;
  confirmTextLabel?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("app.states");
  const [typed, setTyped] = useState("");
  const blocked = confirmText !== undefined && typed.trim() !== confirmText;

  return (
    <Dialog
      open={open}
      onClose={() => {
        setTyped("");
        onClose();
      }}
      title={title}
    >
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">{body}</div>
        {confirmText !== undefined ? (
          <div>
            <label htmlFor="confirm-text" className="mb-1.5 block text-sm font-medium">
              {confirmTextLabel}
            </label>
            <input
              id="confirm-text"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-[0.9375rem] focus-visible:border-primary"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="danger" disabled={blocked || pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
