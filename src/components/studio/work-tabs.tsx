"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { enableRepositoryEventsAction } from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import {
  listCodeAction,
  publishAction,
  readCodeAction,
  refreshDeploymentsAction,
  removeDeployAction,
  setupDeployAction,
} from "@/app/[locale]/(app)/project/[slug]/studio/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Notice } from "@/components/ui/form";
import { Link, useRouter } from "@/i18n/navigation";
import type { DeploymentView, DeployTargetView } from "@/lib/deploy/service";
import { formatRelative } from "@/lib/format";
import type { CodeEntry } from "@/lib/studio/code";
import type { GitState } from "@/lib/studio/git-state";
import { cn } from "@/lib/utils";

type Failure = { code: string; fields?: Record<string, string> };

/** A field-level code first (translated here), then the generic app error. */
function useFailureText() {
  const t = useTranslations("studio.errors");
  const app = useTranslations("app.errors");
  return (e: Failure) => {
    const field = e.fields ? Object.values(e.fields)[0] : undefined;
    if (field && t.has(field as never)) return t(field as never);
    return app.has(e.code as never) ? app(e.code as never) : app("INTERNAL_ERROR");
  };
}

const mono = "font-mono text-xs text-subtle-foreground";

/** Read-only view of the repository: folders, then one file as plain text. */
export function CodeTab({ slug, repository }: { slug: string; repository: string | null }) {
  const t = useTranslations("studio.code");
  const failure = useFailureText();
  const [pending, start] = useTransition();
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState<CodeEntry[] | null>(null);
  const [file, setFile] = useState<{ path: string; content: string; truncated: boolean } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  if (!repository) return <NoRepository slug={slug} />;

  const open = (path: string) =>
    start(async () => {
      setError(null);
      const r = await listCodeAction(slug, path);
      if (!r.ok) return setError(failure(r));
      setDir(path);
      setFile(null);
      setEntries(r.data);
    });
  const view = (path: string) =>
    start(async () => {
      setError(null);
      const r = await readCodeAction(slug, path);
      if (!r.ok) return setError(failure(r));
      setFile(r.data);
    });
  const up = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("hint", { repository })}</p>
      {entries === null ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => open("")}>
          {pending ? t("loading") : t("open")}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">/{dir}</span>
          {dir ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => open(up)}>
              {t("up")}
            </Button>
          ) : null}
        </div>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {entries ? (
        <ul className="divide-y divide-border rounded-md border border-border" aria-busy={pending}>
          {entries.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">{t("empty")}</li>
          ) : null}
          {entries.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                onClick={() => (e.type === "dir" ? open(e.path) : view(e.path))}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface"
              >
                <span aria-hidden="true" className={mono}>
                  {e.type === "dir" ? "▸" : "·"}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.path.split("/").pop()}</span>
                {e.type === "file" ? (
                  <span className={mono}>{Math.max(1, Math.round(e.size / 1024))} KB</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {file ? (
        <section aria-label={file.path}>
          <p className={cn(mono, "mb-1 break-all")}>{file.path}</p>
          {/* Plain text in a <pre>: repository files are never rendered as HTML. */}
          <pre className="max-h-96 overflow-auto rounded-md border border-border bg-surface-raised p-3 font-mono text-xs whitespace-pre">
            {file.content}
          </pre>
          {file.truncated ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("truncated")}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function NoRepository({ slug }: { slug: string }) {
  const t = useTranslations("studio");
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>{t("noRepository")}</p>
      <Link
        href={`/project/${slug}/integrations`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        {t("connectRepository")}
      </Link>
    </div>
  );
}

const TONE: Record<string, string> = {
  success: "border-success/40 text-success",
  failure: "border-error/50 text-error",
  merged: "border-success/40 text-success",
  open: "border-info/40 text-info",
  closed: "border-border text-muted-foreground",
};

/** Branches and pull requests found for tasks, CI runs, and the switch that turns events on. */
export function GitTab({
  slug,
  git,
  canManage,
}: {
  slug: string;
  git: GitState;
  canManage: boolean;
}) {
  const t = useTranslations("studio.git");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failure = useFailureText();
  if (!git.repository) return <NoRepository slug={slug} />;

  const enable = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await enableRepositoryEventsAction(slug, {});
      if (!r.ok) return setError(failure(r));
      if (r.data.installed) setNotice(t("installed"));
      else setSecret({ url: r.data.webhookUrl, secret: r.data.webhookSecret ?? "" });
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <p className="text-sm">
        <span className="font-mono">{git.repository.fullName}</span>
        <span className={cn(mono, "ml-2")}>
          {git.repository.defaultBranch}
          {git.repository.headSha ? ` · ${git.repository.headSha.slice(0, 8)}` : ""}
        </span>
      </p>
      {!git.repository.eventsOn ? (
        <Notice tone="info">
          <p>{t("eventsOff")}</p>
          {canManage ? (
            <Button size="sm" className="mt-2" disabled={pending} onClick={enable}>
              {pending ? t("enabling") : t("enable")}
            </Button>
          ) : null}
        </Notice>
      ) : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {secret ? (
        <Notice tone="info">
          <p>{t("manual")}</p>
          <p className="mt-2 break-all font-mono text-xs">URL: {secret.url}</p>
          <p className="mt-1 break-all font-mono text-xs">
            {t("secret")}: {secret.secret}
          </p>
        </Notice>
      ) : null}

      <section aria-labelledby="git-links">
        <h3
          id="git-links"
          className="font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("links")}
        </h3>
        {git.links.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noLinks")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {git.links.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <span className={mono}>{t(`kinds.${l.kind}`)}</span>
                {l.url ? (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs underline underline-offset-2"
                  >
                    {l.kind === "pr" ? `#${l.ref}` : l.ref}
                  </a>
                ) : (
                  <span className="font-mono text-xs">{l.ref}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.taskTitle}</span>
                {l.state ? (
                  <span className={cn("rounded-md border px-1.5 text-xs", TONE[l.state])}>
                    {t(`states.${l.state}`)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="git-ci">
        <h3
          id="git-ci"
          className="font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("ci")}
        </h3>
        {git.ci.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noCi")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {git.ci.map((c) => {
              const result =
                c.status === "completed"
                  ? c.conclusion === "success"
                    ? "success"
                    : "failure"
                  : null;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className={mono}>
                    {c.branch ?? ""} {c.sha}
                  </span>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 text-xs",
                      result ? TONE[result] : "border-border text-muted-foreground",
                    )}
                  >
                    {result ? t(`ciResult.${result}`) : t(`ciStatus.${c.status}`)}
                  </span>
                  <span className={mono}>{formatRelative(new Date(c.updatedAt), locale)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The latest deployment in a frame, with a picker for earlier ones. */
export function PreviewTab({
  deployments,
  onPublish,
}: {
  deployments: DeploymentView[];
  onPublish: () => void;
}) {
  const t = useTranslations("studio.preview");
  const id = useId();
  const withUrl = deployments.filter((d) => d.url && d.state === "success");
  const [picked, setPicked] = useState<string | null>(null);
  const current = withUrl.find((d) => d.id === picked) ?? withUrl[0];
  if (!current?.url)
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>{t("none")}</p>
        <Button size="sm" variant="outline" onClick={onPublish}>
          {t("goPublish")}
        </Button>
      </div>
    );
  return (
    <div className="flex h-full min-h-[20rem] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-pick`} className="sr-only">
          {t("pick")}
        </label>
        <select
          id={`${id}-pick`}
          value={current.id}
          onChange={(e) => setPicked(e.target.value)}
          className="min-h-11 rounded-md border border-border-strong bg-surface px-2 text-sm sm:min-h-9"
        >
          {withUrl.map((d) => (
            <option key={d.id} value={d.id}>
              {t(`env.${d.environment}`)} · {d.sha ? d.sha.slice(0, 7) : d.id.slice(0, 7)}
            </option>
          ))}
        </select>
        <a
          href={current.url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("open")}
        </a>
      </div>
      {/* The site is another origin: scripts run, but it cannot touch Saqina or navigate it. */}
      <iframe
        title={t("frame")}
        src={current.url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        className="min-h-[18rem] w-full flex-1 rounded-md border border-border bg-white"
      />
    </div>
  );
}

/** Where the project is published, the Publish button, and the choice of Vercel account. */
export function PublishTab({
  slug,
  target,
  deployments,
  canManage,
}: {
  slug: string;
  target: DeployTargetView;
  deployments: DeploymentView[];
  canManage: boolean;
}) {
  const t = useTranslations("studio.publish");
  const failure = useFailureText();
  const router = useRouter();
  const locale = useLocale();
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [owner, setOwner] = useState<"saqina" | "client">(target.owner);

  const run = (
    fn: () => Promise<{ ok: true; data?: unknown } | ({ ok: false } & Failure)>,
    done?: string,
  ) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (!r.ok) return setError(failure(r));
      if (done) setNotice(done);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border p-3">
        <p className="text-sm font-medium">{t("where")}</p>
        <p className="mt-1 break-all font-mono text-sm">{target.domain}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {target.owner === "saqina" ? t("ownerSaqina") : t("ownerClient")} ·{" "}
          {t(`status.${target.status}`)}
          {target.lastError ? ` · ${t(`lastError.${target.lastError}` as never)}` : ""}
        </p>
        {!target.repository ? (
          <p className="mt-2 text-sm text-warning">{t("needsRepository")}</p>
        ) : null}
        {canManage ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={
                pending ||
                !target.repository ||
                (target.owner === "saqina" && !target.saqinaAvailable)
              }
              onClick={() => run(() => publishAction(slug), t("published"))}
            >
              {pending ? t("publishing") : t("publish")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => refreshDeploymentsAction(slug))}
            >
              {t("refresh")}
            </Button>
          </div>
        ) : null}
      </section>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <section aria-labelledby={`${id}-dep`}>
        <h3
          id={`${id}-dep`}
          className="font-mono text-xs uppercase tracking-wide text-subtle-foreground"
        >
          {t("history")}
        </h3>
        {deployments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noDeployments")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {deployments.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <span className={mono}>{t(`env.${d.environment}`)}</span>
                <span
                  className={cn(
                    "rounded-md border px-1.5 text-xs",
                    d.state === "success"
                      ? TONE.success
                      : d.state === "failure"
                        ? TONE.failure
                        : "border-border text-muted-foreground",
                  )}
                >
                  {t(`state.${d.state}`)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {d.url.replace(/^https:\/\//, "")}
                    </a>
                  ) : null}
                </span>
                <span className={mono}>{formatRelative(new Date(d.updatedAt), locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <form
          className="space-y-3 rounded-md border border-border p-3"
          action={(form) =>
            run(
              () =>
                setupDeployAction(slug, {
                  owner,
                  token: String(form.get("token") ?? "") || undefined,
                  teamId: String(form.get("teamId") ?? "") || null,
                  domain: String(form.get("domain") ?? "") || null,
                }),
              t("saved"),
            )
          }
        >
          <fieldset>
            <legend className="text-sm font-medium">{t("account")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(["saqina", "client"] as const).map((o) => (
                <label
                  key={o}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm",
                    owner === o ? "border-primary" : "border-border",
                    o === "saqina" && !target.saqinaAvailable && "opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="owner"
                    className="mt-1"
                    checked={owner === o}
                    disabled={o === "saqina" && !target.saqinaAvailable}
                    onChange={() => setOwner(o)}
                  />
                  <span>
                    <span className="block font-medium">{t(`owners.${o}`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {o === "saqina"
                        ? target.saqinaAvailable
                          ? t("ownersHint.saqina", { domain: target.defaultDomain })
                          : t("ownersHint.saqinaOff")
                        : t("ownersHint.client")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {owner === "client" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id={`${id}-token`}
                name="token"
                type="password"
                autoComplete="off"
                label={t("token")}
                hint={target.hasClientToken ? t("tokenKept") : t("tokenHint")}
                maxLength={500}
              />
              <Field
                id={`${id}-team`}
                name="teamId"
                label={t("teamId")}
                hint={t("teamHint")}
                maxLength={64}
              />
              <Field
                id={`${id}-domain`}
                name="domain"
                label={t("domain")}
                hint={t("domainHint")}
                defaultValue={
                  target.domain && target.domain !== target.defaultDomain ? target.domain : ""
                }
                maxLength={253}
                className="sm:col-span-2"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={pending}>
              {t("save")}
            </Button>
            {target.hasClientToken ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => removeDeployAction(slug))}
              >
                {t("remove")}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
