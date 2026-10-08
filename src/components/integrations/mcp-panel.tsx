"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  connectMcpAction,
  createMcpAction,
  disconnectMcpAction,
  setToolTrustAction,
} from "@/app/[locale]/(app)/project/[slug]/integrations/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, Field, Notice, Select } from "@/components/ui/form";
import { MCP_AUTH_TYPES, MCP_SERVER_TYPES, TOOL_RISKS } from "@/lib/domain/enums";
import type { McpConnectionView } from "@/lib/mcp/service";
import { cn } from "@/lib/utils";

interface ToolView {
  id: string;
  name: string;
  source: "internal" | "mcp" | "git";
  connectionId: string | null;
  description: string;
  riskLevel: (typeof TOOL_RISKS)[number];
  trust: "discovered" | "enabled" | "disabled";
}

/** MCP servers and their tools. Discovered tools stay off until someone enables them. */
export function McpPanel({
  slug,
  connections,
  tools,
  canManage,
}: {
  slug: string;
  connections: McpConnectionView[];
  tools: ToolView[];
  canManage: boolean;
}) {
  const t = useTranslations("integrations.mcp");
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<McpConnectionView | null>(null);
  const [result, setResult] = useState<{ ok: boolean; code: string; tools: number } | null>(null);
  const { pending, error, run } = useRun();

  return (
    <section aria-labelledby={`${id}-mcp`} className="rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-mcp`} className="font-semibold">
          {t("title")}
        </h2>
        {canManage ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
          >
            {t("add")}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("discoveredHint")}</p>
      {result ? (
        <Notice tone={result.ok ? "success" : "error"} className="mt-3">
          {result.ok
            ? t("result.ok", { count: result.tools })
            : t("result.failed", { reason: result.code })}
        </Notice>
      ) : null}
      <FormError error={error} />
      {adding ? (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          action={(form) =>
            run(
              () =>
                createMcpAction(slug, {
                  name: String(form.get("name") ?? ""),
                  serverType: String(form.get("serverType")),
                  endpoint: String(form.get("endpoint") ?? ""),
                  authType: String(form.get("authType")),
                  authHeader: String(form.get("authHeader") ?? "") || null,
                  secret: String(form.get("secret") ?? "") || undefined,
                }),
              () => setAdding(false),
            )
          }
        >
          <Field id={`${id}-name`} name="name" label={t("name")} required maxLength={60} />
          <Select id={`${id}-type`} name="serverType" label={t("serverType")} defaultValue="remote">
            {MCP_SERVER_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`types.${x}`)}
              </option>
            ))}
          </Select>
          <Field
            id={`${id}-endpoint`}
            name="endpoint"
            label={t("endpoint")}
            required
            maxLength={300}
            className="sm:col-span-2"
          />
          <Select id={`${id}-auth`} name="authType" label={t("authType")} defaultValue="none">
            {MCP_AUTH_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`auth.${x}`)}
              </option>
            ))}
          </Select>
          <Field id={`${id}-header`} name="authHeader" label={t("authHeader")} maxLength={60} />
          <Field
            id={`${id}-secret`}
            name="secret"
            type="password"
            autoComplete="off"
            label={t("secret")}
            maxLength={1000}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      ) : null}
      {connections.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {connections.map((c) => {
            const own = tools.filter((x) => x.connectionId === c.id);
            return (
              <li key={c.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="truncate font-mono text-xs text-subtle-foreground">
                      {c.endpoint}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`types.${c.serverType}`)} · {t(`auth.${c.authType}`)}
                      {c.lastError ? ` · ${c.lastError}` : ""}
                    </p>
                  </div>
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs">
                    {c.status}
                  </span>
                </div>
                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => connectMcpAction(slug, { id: c.id }), setResult)}
                    >
                      {c.status === "connected" ? t("reconnect") : t("connect")}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirm(c)}>
                      {t("disconnect")}
                    </Button>
                  </div>
                ) : null}
                <h3 className="mt-4 font-mono text-xs uppercase tracking-wide text-subtle-foreground">
                  {t("tools")}
                </h3>
                {own.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("noTools")}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {own.map((tool) => (
                      <li key={tool.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        <span className="font-mono">{tool.name}</span>
                        <span
                          className={cn(
                            "rounded-md border px-1.5 text-xs",
                            tool.trust === "enabled"
                              ? "border-success/40 text-success"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {t(`trust.${tool.trust}`)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {tool.description}
                        </span>
                        {canManage ? (
                          <>
                            <label className="sr-only" htmlFor={`${tool.id}-risk`}>
                              {t("risk")}
                            </label>
                            <select
                              id={`${tool.id}-risk`}
                              defaultValue={tool.riskLevel}
                              onChange={(e) =>
                                run(() =>
                                  setToolTrustAction(slug, {
                                    toolId: tool.id,
                                    riskLevel: e.target.value,
                                  }),
                                )
                              }
                              className={cn(FIELD_CLASS, "h-9 w-auto py-0 text-xs")}
                            >
                              {TOOL_RISKS.map((r) => (
                                <option key={r} value={r}>
                                  {t(`risks.${r}`)}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant={tool.trust === "enabled" ? "ghost" : "outline"}
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  setToolTrustAction(slug, {
                                    toolId: tool.id,
                                    trust: tool.trust === "enabled" ? "disabled" : "enabled",
                                  }),
                                )
                              }
                            >
                              {tool.trust === "enabled" ? t("disable") : t("enable")}
                              <span className="sr-only">: {tool.name}</span>
                            </Button>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={t("disconnectTitle", { name: confirm?.name ?? "" })}
        body={t("disconnectBody")}
        confirmLabel={t("disconnect")}
        pending={pending}
        onConfirm={() =>
          confirm &&
          run(
            () => disconnectMcpAction(slug, { id: confirm.id }),
            () => setConfirm(null),
          )
        }
        onClose={() => setConfirm(null)}
      />
    </section>
  );
}
