"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { UIMessage } from "./types";

type Attachment = NonNullable<UIMessage["attachments"]>[number];

export interface PendingFile {
  localId: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  error?: string;
  view?: Attachment;
}

/** Same limits as the server; the server still checks everything again. */
const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
export const ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,.md,.markdown,.txt,.csv,.tsv,.json,.yaml,.yml,.xml,.log,.sql,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.php,.rb,.css";

export const formatSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Uploads files as soon as they are picked, so sending the message is instant. */
export function useAttachments(slug: string) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const t = useTranslations("assistant.attach");

  const update = (localId: string, patch: Partial<PendingFile>) =>
    setFiles((list) => list.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));

  const add = (picked: FileList | File[]) => {
    const room = MAX_FILES - files.length;
    for (const file of Array.from(picked).slice(0, Math.max(room, 0))) {
      const localId = crypto.randomUUID();
      const tooBig = file.size > MAX_BYTES;
      setFiles((list) => [
        ...list,
        {
          localId,
          name: file.name,
          size: file.size,
          status: tooBig ? "error" : "uploading",
          error: tooBig ? t("errors.tooLarge") : undefined,
        },
      ]);
      if (tooBig) continue;
      const body = new FormData();
      body.append("file", file);
      void fetch(`/api/projects/${slug}/attachments`, { method: "POST", body })
        .then(async (response) => {
          const json = (await response.json().catch(() => null)) as {
            ok?: boolean;
            data?: Attachment;
            code?: string;
            fields?: Record<string, string>;
          } | null;
          if (response.ok && json?.ok && json.data)
            return update(localId, { status: "ready", view: json.data });
          const field = json?.fields ? Object.values(json.fields)[0] : undefined;
          update(localId, {
            status: "error",
            error:
              field && t.has(`errors.${field}` as never)
                ? t(`errors.${field}` as never)
                : t("errors.failed"),
          });
        })
        .catch(() => update(localId, { status: "error", error: t("errors.failed") }));
    }
  };

  return {
    files,
    add,
    remove: (localId: string) => setFiles((list) => list.filter((f) => f.localId !== localId)),
    clear: () => setFiles([]),
    ready: files.filter((f) => f.status === "ready" && f.view).map((f) => f.view as Attachment),
    uploading: files.some((f) => f.status === "uploading"),
    full: files.length >= MAX_FILES,
  };
}

export interface PickedContext {
  skills: { slug: string; name: string }[];
  connectors: { id: string; name: string }[];
}

export const NO_CONTEXT: PickedContext = { skills: [], connectors: [] };

/** Files and context waiting to go with the next message. */
export function ComposerChips({
  files,
  onRemoveFile,
  picked,
  onChange,
}: {
  files: PendingFile[];
  onRemoveFile: (localId: string) => void;
  picked: PickedContext;
  onChange: (next: PickedContext) => void;
}) {
  const t = useTranslations("assistant.attach");
  if (files.length === 0 && picked.skills.length === 0 && picked.connectors.length === 0)
    return null;
  const chip = "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs";
  const remove = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("remove", { name: label })}
      className="-my-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
    >
      <span aria-hidden="true">×</span>
    </button>
  );
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={t("pending")}>
      {files.map((f) => (
        <li
          key={f.localId}
          className={cn(
            chip,
            f.status === "error" ? "border-error/50 text-error" : "border-border",
          )}
        >
          <span className="truncate">{f.name}</span>
          <span className="shrink-0 font-mono text-subtle-foreground">
            {f.status === "uploading"
              ? t("uploading")
              : f.status === "error"
                ? f.error
                : formatSize(f.size)}
          </span>
          {remove(f.name, () => onRemoveFile(f.localId))}
        </li>
      ))}
      {picked.skills.map((s) => (
        <li key={s.slug} className={cn(chip, "border-primary/50")}>
          <span className="shrink-0 text-subtle-foreground">{t("skill")}</span>
          <span className="truncate">{s.name}</span>
          {remove(s.name, () =>
            onChange({ ...picked, skills: picked.skills.filter((x) => x.slug !== s.slug) }),
          )}
        </li>
      ))}
      {picked.connectors.map((c) => (
        <li key={c.id} className={cn(chip, "border-info/40")}>
          <span className="shrink-0 text-subtle-foreground">{t("connector")}</span>
          <span className="truncate">{c.name}</span>
          {remove(c.name, () =>
            onChange({ ...picked, connectors: picked.connectors.filter((x) => x.id !== c.id) }),
          )}
        </li>
      ))}
    </ul>
  );
}

/** Files shown on a sent message: images as thumbnails, the rest as download links. */
export function MessageAttachments({ slug, files }: { slug: string; files: Attachment[] }) {
  const t = useTranslations("assistant.attach");
  if (files.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("attached")}>
      {files.map((f) => {
        const href = `/api/projects/${slug}/attachments/${f.id}`;
        return (
          <li key={f.id}>
            {f.kind === "image" ? (
              <a href={href} target="_blank" rel="noreferrer" className="block">
                {/* biome-ignore lint/performance/noImgElement: a private, auth-checked file, not an optimisable asset */}
                <img
                  src={href}
                  alt={f.name}
                  className="h-24 max-w-48 rounded-md border border-border object-cover"
                />
              </a>
            ) : (
              <a
                href={href}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-xs hover:bg-surface-raised"
              >
                <span className="font-mono uppercase text-subtle-foreground">
                  {f.kind === "pdf" ? "PDF" : "TXT"}
                </span>
                <span className="max-w-48 truncate">{f.name}</span>
                <span className="font-mono text-subtle-foreground">{formatSize(f.size)}</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
