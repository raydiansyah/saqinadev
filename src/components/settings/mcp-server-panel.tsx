"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import {
  createAgentTokenAction,
  revokeAgentTokenAction,
} from "@/app/[locale]/(app)/project/[slug]/settings/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const SCOPES = [
  "read_project",
  "read_prd",
  "read_tasks",
  "read_memory",
  "write_documents",
] as const;
const DEFAULT_SCOPES: readonly string[] = ["read_project", "read_prd", "read_tasks", "read_memory"];
const EXPIRIES = ["30", "90", "365", "never"] as const;

export interface TokenRow {
  id: string;
  label: string;
  prefix: string;
  agentName: string | null;
  scopes: string[];
  /** Epoch milliseconds, so the props stay plain serializable values. */
  expiresAt: number | null;
  revokedAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
}

export interface AgentOption {
  id: string;
  name: string;
  /** True for the Saqina specialist agents, listed after the external tools. */
  team: boolean;
}

/** Copies text and flips the label to "copied" for a moment. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("project.settings");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(timer);
  }, [done]);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setDone(true));
      }}
    >
      {done ? t("mcpServer.copied") : t("mcpServer.copy")}
      <span className="sr-only">: {label}</span>
    </Button>
  );
}

/** Per-project bearer tokens for the inbound MCP server. The full token is never persisted in the UI. */
export function McpServerPanel({
  slug,
  endpoint,
  agents,
  tokens,
}: {
  slug: string;
  endpoint: string;
  agents: AgentOption[];
  tokens: TokenRow[];
}) {
  const t = useTranslations("project.settings");
  const locale = useLocale();
  const id = useId();
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);
  const [scopes, setScopes] = useState<string[]>([...DEFAULT_SCOPES]);
  const { pending, error, run } = useRun();
  const tools = agents.filter((a) => !a.team);
  const team = agents.filter((a) => a.team);
  const snippet = `claude mcp add --transport http saqina ${endpoint} --header "Authorization: Bearer YOUR_TOKEN"`;

  // The one-time token must not survive navigation.
  useEffect(() => () => setFresh(null), []);

  const toggle = (scope: string) =>
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );

  const statusOf = (row: TokenRow) =>
    row.revokedAt ? "revoked" : row.expiresAt && row.expiresAt < Date.now() ? "expired" : "active";

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-border p-5">
      <h2 id={`${id}-title`} className="font-semibold">
        {t("mcpServer.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("mcpServer.intro")}</p>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("mcpServer.endpoint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs">
              {endpoint}
            </code>
            <CopyButton value={endpoint} label={t("mcpServer.endpoint")} />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("mcpServer.snippet")}</p>
          <div className="flex flex-wrap items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs">
              <code>{snippet}</code>
            </pre>
            <CopyButton value={snippet} label={t("mcpServer.snippet")} />
          </div>
          <p className="mt-1.5 text-xs text-subtle-foreground">{t("mcpServer.snippetHint")}</p>
        </div>
      </div>

      {fresh ? (
        <div
          role="status"
          className="mt-5 rounded-md border border-success/40 bg-surface p-4 text-sm"
        >
          <p className="font-medium">{t("mcpServer.oneTimeTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("mcpServer.oneTimeWarning")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border px-3 py-2 font-mono text-xs">
              {fresh}
            </code>
            <CopyButton value={fresh} label={t("mcpServer.oneTimeTitle")} />
          </div>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => setFresh(null)}>
            {t("mcpServer.dismiss")}
          </Button>
        </div>
      ) : null}

      <h3 className="mt-6 text-sm font-semibold">{t("mcpServer.createTitle")}</h3>
      <FormError error={error} />
      <form
        className="mt-3 grid gap-4 sm:grid-cols-2"
        action={(form) => {
          const days = String(form.get("expiry") ?? "90");
          run<{ token: string }>(
            () =>
              createAgentTokenAction(slug, {
                label: String(form.get("label") ?? ""),
                agentId: String(form.get("agentId") ?? ""),
                scopes,
                expiresInDays: days === "never" ? null : Number(days),
              }),
            (data) => setFresh(data.token),
          );
        }}
      >
        <Field
          id={`${id}-label`}
          name="label"
          label={t("mcpServer.label")}
          placeholder={t("mcpServer.labelPlaceholder")}
          required
          minLength={2}
          maxLength={80}
        />
        <Select id={`${id}-agent`} name="agentId" label={t("mcpServer.agent")} required>
          {tools.length > 0 ? (
            <optgroup label={t("mcpServer.agentGroupTools")}>
              {tools.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {team.length > 0 ? (
            <optgroup label={t("mcpServer.agentGroupTeam")}>
              {team.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">{t("mcpServer.scopes")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCOPES.map((scope) => (
              <label key={scope} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggle(scope)}
                  className="size-4"
                />
                {t(`mcpServer.scopeLabels.${scope}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Select id={`${id}-expiry`} name="expiry" label={t("mcpServer.expiry")} defaultValue="90">
          {EXPIRIES.map((x) => (
            <option key={x} value={x}>
              {t(`mcpServer.expiryOptions.${x}`)}
            </option>
          ))}
        </Select>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending || scopes.length === 0}>
            {t("mcpServer.create")}
          </Button>
        </div>
      </form>

      <h3 className="mt-6 text-sm font-semibold">{t("mcpServer.listTitle")}</h3>
      {tokens.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("mcpServer.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {tokens.map((row) => {
            const status = statusOf(row);
            return (
              <li key={row.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("mcpServer.agentLabel")}: {row.agentName ?? "-"}
                    </p>
                    <p className="break-all font-mono text-xs text-subtle-foreground">
                      {row.prefix}...
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-xs",
                      status === "active"
                        ? "border-success/40 text-success"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {t(`mcpServer.status.${status}`)}
                  </span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {row.scopes.map((s) => (
                    <li
                      key={s}
                      className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {SCOPES.includes(s as (typeof SCOPES)[number])
                        ? t(`mcpServer.scopeLabels.${s as (typeof SCOPES)[number]}`)
                        : s}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("mcpServer.created")}: {formatDateTime(new Date(row.createdAt), locale)}
                  {" · "}
                  {t("mcpServer.lastUsed")}:{" "}
                  {row.lastUsedAt
                    ? formatRelative(new Date(row.lastUsedAt), locale)
                    : t("mcpServer.never")}
                  {" · "}
                  {t("mcpServer.expires")}:{" "}
                  {row.expiresAt
                    ? formatDateTime(new Date(row.expiresAt), locale)
                    : t("mcpServer.noExpiry")}
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="danger"
                  disabled={Boolean(row.revokedAt) || pending}
                  onClick={() => setRevoking(row)}
                >
                  {t("mcpServer.revoke")}
                  <span className="sr-only">: {row.label}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(revoking)}
        title={t("mcpServer.revokeTitle", { label: revoking?.label ?? "" })}
        body={t("mcpServer.revokeBody")}
        confirmLabel={t("mcpServer.revoke")}
        pending={pending}
        onConfirm={() =>
          revoking &&
          run(
            () => revokeAgentTokenAction(slug, revoking.id),
            () => setRevoking(null),
          )
        }
        onClose={() => setRevoking(null)}
      />
    </section>
  );
}
