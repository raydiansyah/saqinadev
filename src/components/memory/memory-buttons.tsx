"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MemoryCategory } from "@/lib/domain/enums";
import { MemoryDialog, type MemoryDraft } from "./memory-dialog";

/** Opens the dialog for a new memory, prefilled with the active category filter. */
export function AddMemoryButton({
  slug,
  category = "product",
}: {
  slug: string;
  category?: MemoryCategory;
}) {
  const t = useTranslations("memory");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("add")}</Button>
      {open ? (
        <MemoryDialog
          slug={slug}
          initial={{ title: "", content: "", category, importance: "normal" }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function EditMemoryButton({ slug, memory }: { slug: string; memory: MemoryDraft }) {
  const t = useTranslations("memory");
  const states = useTranslations("app.states");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`${t("editTitle")}: ${memory.title}`}
        onClick={() => setOpen(true)}
      >
        {states("edit")}
      </Button>
      {open ? <MemoryDialog slug={slug} initial={memory} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
