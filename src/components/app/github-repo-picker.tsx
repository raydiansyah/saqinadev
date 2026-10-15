"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { listGithubReposAction } from "@/app/[locale]/(app)/dashboard/actions";
import { Notice } from "@/components/ui/form";
import type { PickerRepo } from "@/lib/github/repos";
import { cn } from "@/lib/utils";

const SHOWN = 50;

/** Searchable list of the connected account's repositories. Picking one fills the form. */
export function GithubRepoPicker({
  onPick,
  onDisconnected,
}: {
  onPick: (fullName: string) => void;
  onDisconnected: () => void;
}) {
  const t = useTranslations("app");
  const id = useId();
  const [repos, setRepos] = useState<PickerRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  // Held in a ref so a new callback from the parent does not reload the list.
  const dropped = useRef(onDisconnected);
  dropped.current = onDisconnected;

  useEffect(() => {
    let live = true;
    listGithubReposAction().then((result) => {
      if (!live) return;
      if (result.ok) return setRepos(result.data);
      if (result.fields?.github === "token_invalid") {
        // The connection was dropped on the server; show the "Connect" state again.
        dropped.current();
        return;
      }
      setError(result.code === "RATE_LIMIT" ? "rate_limited" : "load_failed");
    });
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? (repos ?? []).filter(
          (r) => r.fullName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
        )
      : (repos ?? []);
    return list.slice(0, SHOWN);
  }, [repos, query]);

  if (error) return <Notice tone="error">{t(`newProject.github.picker.${error}`)}</Notice>;
  if (!repos)
    return <p className="text-sm text-muted-foreground">{t("newProject.github.picker.loading")}</p>;
  if (repos.length === 0)
    return <p className="text-sm text-muted-foreground">{t("newProject.github.picker.empty")}</p>;

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-q`} className="block text-sm font-medium">
        {t("newProject.github.picker.label")}
      </label>
      <input
        id={`${id}-q`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("newProject.github.picker.search")}
        autoComplete="off"
        className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-[0.9375rem] focus-visible:border-primary"
      />
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {shown.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">
            {t("newProject.github.picker.noMatch")}
          </li>
        ) : (
          shown.map((r) => (
            <li key={r.fullName}>
              <button
                type="button"
                aria-pressed={picked === r.fullName}
                onClick={() => {
                  setPicked(r.fullName);
                  onPick(r.fullName);
                }}
                className={cn(
                  "flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface-raised",
                  picked === r.fullName && "bg-surface-raised",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="min-w-0 font-medium break-all">{r.fullName}</span>
                  <span className="shrink-0 font-mono text-xs text-subtle-foreground">
                    {r.private
                      ? t("newProject.github.picker.private")
                      : t("newProject.github.picker.public")}
                  </span>
                </span>
                {r.description ? (
                  <span className="line-clamp-1 text-muted-foreground">{r.description}</span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
