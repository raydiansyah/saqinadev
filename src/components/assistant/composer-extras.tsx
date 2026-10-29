"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { chatContextOptionsAction } from "@/app/[locale]/(app)/project/[slug]/assistant/actions";
import { Link } from "@/i18n/navigation";
import type { ChatContextOptions } from "@/lib/assistant/chat-context";
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

export function AttachButton({
  onFiles,
  disabled,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("assistant.attach");
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label={t("button")}
        title={t("button")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50 sm:size-9"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M14.5 9.5 9 15a3.5 3.5 0 0 1-5-5l6.5-6.5a2.3 2.3 0 0 1 3.3 3.3L7.5 13a1.2 1.2 0 0 1-1.7-1.7L11 6" />
        </svg>
      </button>
    </>
  );
}

export interface PickedContext {
  skills: { slug: string; name: string }[];
  connectors: { id: string; name: string }[];
}

export const NO_CONTEXT: PickedContext = { skills: [], connectors: [] };

/** "+ Context": switched-on skills and usable connectors, and where to manage connectors. */
export function ContextPicker({
  slug,
  value,
  onChange,
}: {
  slug: string;
  value: PickedContext;
  onChange: (next: PickedContext) => void;
}) {
  const t = useTranslations("assistant.contextPicker");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ChatContextOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || options) return;
    void chatContextOptionsAction(slug).then((r) => (r.ok ? setOptions(r.data) : setFailed(true)));
  }, [open, options, slug]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const toggleSkill = (s: { slug: string; name: string }) =>
    onChange({
      ...value,
      skills: value.skills.some((x) => x.slug === s.slug)
        ? value.skills.filter((x) => x.slug !== s.slug)
        : [...value.skills, s].slice(0, 5),
    });
  const toggleConnector = (c: { id: string; name: string }) =>
    onChange({
      ...value,
      connectors: value.connectors.some((x) => x.id === c.id)
        ? value.connectors.filter((x) => x.id !== c.id)
        : [...value.connectors, c].slice(0, 5),
    });
  const manageHref = options?.manage.platform
    ? "/dashboard/ai/connectors"
    : options?.manage.project
      ? `/project/${slug}/integrations`
      : null;

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground sm:min-h-9"
      >
        <span aria-hidden="true">+</span> {t("button")}
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          {failed ? (
            <p className="text-sm text-error">{t("failed")}</p>
          ) : !options ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("loading")}
            </p>
          ) : (
            <>
              <fieldset>
                <legend className="font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
                  {t("skills")}
                </legend>
                {options.skills.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("noSkills")}</p>
                ) : (
                  <ul className="mt-1">
                    {options.skills.map((s) => (
                      <li key={s.slug}>
                        <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={value.skills.some((x) => x.slug === s.slug)}
                            onChange={() => toggleSkill({ slug: s.slug, name: s.name })}
                          />
                          <span className="min-w-0">
                            <span className="block">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {s.description}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <fieldset className="mt-3 border-t border-border pt-3">
                <legend className="font-mono text-[0.6875rem] uppercase tracking-wider text-subtle-foreground">
                  {t("connectors")}
                </legend>
                {options.connectors.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("noConnectors")}</p>
                ) : (
                  <ul className="mt-1">
                    {options.connectors.map((c) => (
                      <li key={c.id}>
                        <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={value.connectors.some((x) => x.id === c.id)}
                            onChange={() => toggleConnector({ id: c.id, name: c.name })}
                          />
                          <span className="min-w-0">
                            <span className="block">{c.name}</span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {t("tools", { count: c.tools.length })}: {c.tools.join(", ")}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              {manageHref ? (
                <Link
                  href={manageHref}
                  className="mt-3 inline-flex min-h-11 items-center text-sm text-primary underline-offset-2 hover:underline"
                >
                  {t("manage")}
                </Link>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">{t("askOwner")}</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
