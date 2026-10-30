"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { BrowseDialog, type BrowseItem, type BrowseKind } from "./browse-dialog";
import { ACCEPT, type PickedContext } from "./composer-extras";
import { useContextOptions, useYours } from "./use-yours";

type View = "root" | "slash" | "skills" | "connectors";
type Mode = "chat" | "plan" | "build";

const item =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-surface-raised focus-visible:bg-surface-raised sm:min-h-10";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-4 shrink-0 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d={d} />
    </svg>
  );
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none",
        on ? "bg-primary" : "bg-border-strong",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute size-4 rounded-full bg-background transition-transform motion-reduce:transition-none",
          on ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
}

/**
 * The "+" of the composer: files, slash commands, and the skills and connectors this person
 * added. Browse opens the full list. A switch only decides whether the next messages use it.
 */
export function ComposerMenu({
  slug,
  canWrite,
  disabled,
  filesDisabled,
  onFiles,
  picked,
  onPicked,
  mode,
}: {
  slug: string;
  canWrite: boolean;
  disabled?: boolean;
  filesDisabled?: boolean;
  onFiles: (files: FileList) => void;
  picked: PickedContext;
  onPicked: (next: PickedContext) => void;
  /** Present in the Studio, where Plan and Build exist. */
  mode?: { value: Mode; set: (m: Mode) => void };
}) {
  const t = useTranslations("assistant.menu");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("root");
  const [browse, setBrowse] = useState<BrowseKind | null>(null);
  const [yours, setYours] = useYours(slug);
  const { options, failed, load } = useContextOptions(slug);
  const root = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    load();
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) setView("root");
  }, [open]);

  const items: BrowseItem[] = useMemo(
    () => [
      ...(options?.skills ?? []).map((s) => ({
        kind: "skills" as const,
        id: s.slug,
        name: s.name,
        detail: s.description,
      })),
      ...(options?.connectors ?? []).map((c) => ({
        kind: "connectors" as const,
        id: c.id,
        name: c.name,
        detail: `${t("tools", { count: c.tools.length })}: ${c.tools.join(", ")}`,
      })),
    ],
    [options, t],
  );

  const toggle = (it: BrowseItem) => {
    const on = isOn(it);
    if (it.kind === "skills")
      onPicked({
        ...picked,
        skills: on
          ? picked.skills.filter((x) => x.slug !== it.id)
          : [...picked.skills, { slug: it.id, name: it.name }].slice(0, 5),
      });
    else
      onPicked({
        ...picked,
        connectors: on
          ? picked.connectors.filter((x) => x.id !== it.id)
          : [...picked.connectors, { id: it.id, name: it.name }].slice(0, 5),
      });
  };
  const isOn = (it: BrowseItem) =>
    it.kind === "skills"
      ? picked.skills.some((x) => x.slug === it.id)
      : picked.connectors.some((x) => x.id === it.id);

  const add = (it: BrowseItem) => {
    if (!yours[it.kind].includes(it.id))
      setYours({ ...yours, [it.kind]: [...yours[it.kind], it.id] });
    if (!isOn(it)) toggle(it);
  };
  const remove = (it: BrowseItem) => {
    setYours({ ...yours, [it.kind]: yours[it.kind].filter((x) => x !== it.id) });
    if (isOn(it)) toggle(it);
  };

  const manageHref = (kind: BrowseKind) =>
    kind === "skills"
      ? options?.manage.platform
        ? "/dashboard/ai/skills"
        : null
      : options?.manage.platform
        ? "/dashboard/ai/connectors"
        : options?.manage.project
          ? `/project/${slug}/integrations`
          : null;

  const openBrowse = (kind: BrowseKind) => {
    setOpen(false);
    setBrowse(kind);
  };

  const sub = (kind: BrowseKind) => {
    const mine = items.filter((i) => i.kind === kind && yours[kind].includes(i.id));
    const href = manageHref(kind);
    return (
      <div role="menu" aria-label={t(kind)} className="p-1.5">
        <button type="button" onClick={() => setView("root")} className={item}>
          <span aria-hidden="true">←</span> {t("back")}
        </button>
        <button type="button" role="menuitem" onClick={() => openBrowse(kind)} className={item}>
          <Icon d="M3 4h3v12H3zM8 4h3v12H8zM13.5 4.5l3 .8-2.6 10.7-3-.8z" />
          {t(kind === "skills" ? "browseSkills" : "browseConnectors")}
        </button>
        {href ? (
          <Link href={href} role="menuitem" onClick={() => setOpen(false)} className={item}>
            <Icon d="M3 7h14v9H3zM7 7V4.5h6V7" />
            {t(kind === "skills" ? "manageSkills" : "manageConnectors")}
          </Link>
        ) : null}
        <div className="my-1 border-t border-border" />
        {!options && !failed ? (
          <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
            {t("loading")}
          </p>
        ) : failed ? (
          <p className="px-3 py-2 text-xs text-error">{t("failed")}</p>
        ) : mine.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t("noneYet")}</p>
        ) : (
          mine.map((i) => (
            <div key={i.id} className={cn(item, "justify-between")}>
              <span className="truncate">{i.name}</span>
              <Switch on={isOn(i)} label={t("use", { name: i.name })} onToggle={() => toggle(i)} />
            </div>
          ))
        )}
      </div>
    );
  };

  const slash = (
    <div role="menu" aria-label={t("slash")} className="p-1.5">
      <button type="button" onClick={() => setView("root")} className={item}>
        <span aria-hidden="true">←</span> {t("back")}
      </button>
      {mode
        ? (["chat", "plan", "build"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={mode.value === m}
              onClick={() => {
                mode.set(m);
                setOpen(false);
              }}
              className={item}
            >
              <span className="font-mono text-xs">/{m}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {t(`mode.${m}`)}
              </span>
              {mode.value === m ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))
        : null}
      {(["skills", "connectors"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="menuitem"
          onClick={() => openBrowse(k)}
          className={item}
        >
          <span className="font-mono text-xs">/{k}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {t(k === "skills" ? "browseSkills" : "browseConnectors")}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div ref={root} className="relative">
      <input
        ref={files}
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
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={t("button")}
        title={t("button")}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground disabled:opacity-50 sm:size-9"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>
      {open ? (
        <div id={`${id}-menu`} className="absolute bottom-full left-0 z-20 mb-2">
          <div className="relative w-[min(17rem,calc(100vw-2rem))] rounded-lg border border-border-strong bg-surface shadow-lg">
            <div
              role="menu"
              aria-label={t("button")}
              className={cn("p-1.5", view !== "root" && "hidden")}
            >
              {canWrite ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={filesDisabled}
                  onClick={() => {
                    setOpen(false);
                    files.current?.click();
                  }}
                  className={cn(item, "disabled:opacity-50")}
                >
                  <Icon d="M14.5 9.5 9 15a3.5 3.5 0 0 1-5-5l6.5-6.5a2.3 2.3 0 0 1 3.3 3.3L7.5 13a1.2 1.2 0 0 1-1.7-1.7L11 6" />
                  {t("files")}
                </button>
              ) : null}
              {(["slash", "skills", "connectors"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={view === v}
                  onClick={() => setView(v)}
                  className={cn(item, view === v && "bg-surface-raised")}
                >
                  <Icon
                    d={
                      v === "slash"
                        ? "M12.5 3.5 7.5 16.5"
                        : v === "skills"
                          ? "M4 4h12v12H4zM7 8h6M7 11h4"
                          : "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM13.5 11v5M11 13.5h5"
                    }
                  />
                  <span className="flex-1">{t(v)}</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ›
                  </span>
                </button>
              ))}
            </div>
            {view !== "root" ? <div>{view === "slash" ? slash : sub(view)}</div> : null}
          </div>
        </div>
      ) : null}
      <BrowseDialog
        open={browse !== null}
        onClose={() => setBrowse(null)}
        kind={browse ?? "skills"}
        onKind={(k) => setBrowse(k)}
        items={items}
        loading={!options && !failed}
        failed={failed}
        yours={yours}
        onAdd={add}
        onRemove={remove}
      />
    </div>
  );
}
