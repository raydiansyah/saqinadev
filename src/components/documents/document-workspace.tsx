"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  saveDocumentAction,
  setDocumentStatusAction,
} from "@/app/[locale]/(app)/project/[slug]/documents/actions";
import { SaveIndicator, type SaveState } from "@/components/app/save-indicator";
import { AskSaqinaButton } from "@/components/assistant/command-center";
import { LocalTime } from "@/components/primitives/local-time";
import { StartBuildingButton } from "@/components/studio/start-building-button";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import type { SigningView } from "@/lib/documents/signing";
import type { DocumentStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import { Letterhead } from "./letterhead";
import { SigningPanel } from "./signing-panel";
import { type DocSyncInfo, SyncBadge } from "./sync-badge";

// The Markdown renderer only loads when a document is actually shown.
const MarkdownPreview = dynamic(() => import("./markdown-preview"), {
  loading: () => <PreviewLoading />,
});

function PreviewLoading() {
  const t = useTranslations("documents");
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {t("loadingPreview")}
    </p>
  );
}

export interface DocumentData {
  slug: string;
  content: string;
  version: number;
  status: DocumentStatus;
  updatedAt: string;
}

type Mode = "preview" | "source" | "edit";

/** Developer-style document: PRD.md header, Edit / Preview / Copy, versioned saves. */
export function DocumentWorkspace({
  projectSlug,
  doc,
  canEdit,
  sync,
  signing,
  canSign = false,
  issuer = "",
  startBuilding = false,
}: {
  projectSlug: string;
  doc: DocumentData;
  canEdit: boolean;
  /** Repository sync state; absent for documents that do not sync. */
  sync?: DocSyncInfo | null;
  /** Two-party signing state; only meaningful for proposals, agreements and the like. */
  signing?: SigningView;
  canSign?: boolean;
  /** Name of the organization that owns the document, for the letterhead. */
  issuer?: string;
  /** Show "Start building", which opens the Studio (and starts agents when Saqina builds). */
  startBuilding?: boolean;
}) {
  const t = useTranslations("documents");
  const errors = useTranslations("app.errors");
  const router = useRouter();
  const editorId = useId();
  const [mode, setMode] = useState<Mode>("preview");
  const [draft, setDraft] = useState(doc.content);
  const [base, setBase] = useState({
    version: doc.version,
    content: doc.content,
    updatedAt: doc.updatedAt,
  });
  const [save, setSave] = useState<SaveState>("idle");
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const editor = useRef<HTMLTextAreaElement>(null);
  const file = `${doc.slug.toUpperCase()}.md`;
  const dirty = mode === "edit" && draft !== base.content;

  // A newer version from the server (after a refresh) becomes the new base. A draft being
  // edited is kept, so the user can save it on top of the latest version.
  useEffect(() => {
    if (doc.version <= base.version) return;
    setBase({ version: doc.version, content: doc.content, updatedAt: doc.updatedAt });
    setStale(false);
    if (mode !== "edit") setDraft(doc.content);
  }, [doc.version, doc.content, doc.updatedAt, base.version, mode]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (mode === "edit") editor.current?.focus();
  }, [mode]);

  function onSave() {
    setSave("saving");
    setError(null);
    startTransition(async () => {
      const result = await saveDocumentAction(projectSlug, {
        docSlug: doc.slug,
        content: draft,
        baseVersion: base.version,
      });
      if (!result.ok) {
        setSave("error");
        if (result.code === "CONFLICT") setStale(true);
        else setError(errors(result.code));
        return;
      }
      setBase({ version: result.data.version, content: draft, updatedAt: result.data.updatedAt });
      setSave("saved");
      setMode("preview");
    });
  }

  function onStatus(status: DocumentStatus) {
    startTransition(async () => {
      const result = await setDocumentStatusAction(projectSlug, doc.slug, status);
      if (!result.ok) setError(errors(result.code));
    });
  }

  async function onCopy() {
    await navigator.clipboard.writeText(mode === "edit" ? draft : base.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "preview", label: t("preview") },
    { id: "source", label: t("source") },
    // Signed and archived documents are records: read-only.
    ...(canEdit && doc.status !== "signed" && doc.status !== "archived"
      ? [{ id: "edit" as const, label: t("edit") }]
      : []),
  ];

  return (
    <>
      <article className="rounded-lg border border-border">
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-mono text-sm font-medium">{file}</h1>
            <span className="text-xs text-muted-foreground">
              {t("updatedAt")} <LocalTime iso={base.updatedAt} />
            </span>
            <span className="font-mono text-xs text-subtle-foreground">
              {t("version", { version: base.version })}
            </span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                doc.status === "approved"
                  ? "border-success/40 text-success"
                  : "border-border text-muted-foreground",
              )}
            >
              {t(`statuses.${doc.status}`)}
            </span>
            {sync ? (
              <SyncBadge
                projectSlug={projectSlug}
                docSlug={doc.slug}
                sync={sync}
                saqinaText={base.content}
                canResolve={canEdit}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <AskSaqinaButton
              context={{
                type: doc.slug === "prd" ? "prd" : "document",
                id: doc.slug,
                label: file,
              }}
            />
            <div
              role="group"
              aria-label={file}
              className="flex rounded-md border border-border p-0.5"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={mode === tab.id}
                  onClick={() => setMode(tab.id)}
                  className="min-h-9 rounded-sm px-3 text-sm text-muted-foreground aria-pressed:bg-surface-raised aria-pressed:text-foreground"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={onCopy}>
              {copied ? t("copied") : t("copy")}
            </Button>
            <span aria-live="polite" className="sr-only">
              {copied ? t("copied") : ""}
            </span>
          </div>
        </header>

        {stale ? (
          <Notice tone="warning" className="m-4">
            {t("stale")}{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => router.refresh()}
            >
              {t("reload")}
            </button>
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="error" className="m-4">
            {error}
          </Notice>
        ) : null}

        <div className="p-4 sm:p-6">
          {mode === "preview" ? (
            <>
              <Letterhead issuer={issuer} reference={signing?.reference} />
              <MarkdownPreview content={base.content} />
            </>
          ) : mode === "source" ? (
            <pre className="overflow-x-auto font-mono text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {base.content}
            </pre>
          ) : (
            <div className="space-y-3">
              <label htmlFor={editorId} className="sr-only">
                {t("editorLabel", { file })}
              </label>
              <textarea
                id={editorId}
                ref={editor}
                value={draft}
                placeholder={t("editorPlaceholder")}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSave("dirty");
                }}
                spellCheck
                rows={24}
                className={cn(
                  FIELD_CLASS,
                  "min-h-[50vh] resize-y py-3 font-mono text-sm leading-relaxed",
                )}
              />
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <SaveIndicator state={dirty ? "dirty" : save === "dirty" ? "idle" : save} />
          <div className="flex flex-wrap gap-2">
            {mode === "edit" ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(base.content);
                    setSave("idle");
                    setMode("preview");
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button size="sm" onClick={onSave} disabled={pending || !dirty}>
                  {t("save")}
                </Button>
              </>
            ) : canEdit ? (
              doc.status === "approved" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatus("draft")}
                    disabled={pending}
                  >
                    {t("markDraft")}
                  </Button>
                  {/* Signed = the agreed record; it can no longer be edited or regenerated. Documents
                    two parties sign are signed in the panel below, never by one click. */}
                  {signing?.signable ? null : (
                    <Button size="sm" onClick={() => onStatus("signed")} disabled={pending}>
                      {t("markSigned")}
                    </Button>
                  )}
                </>
              ) : doc.status === "signed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatus("archived")}
                  disabled={pending}
                >
                  {t("archive")}
                </Button>
              ) : doc.status === "archived" ? null : (
                <Button size="sm" onClick={() => onStatus("approved")} disabled={pending}>
                  {t("approve")}
                </Button>
              )
            ) : null}
            {startBuilding && mode !== "edit" ? (
              <StartBuildingButton slug={projectSlug} size="sm" />
            ) : null}
          </div>
        </footer>
      </article>
      {signing?.signable ? (
        <SigningPanel
          side="team"
          projectSlug={projectSlug}
          docSlug={doc.slug}
          view={signing}
          canAct={canSign}
        />
      ) : null}
    </>
  );
}
