"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  addCustomConnectorAction,
  addPresetConnectorAction,
  connectConnectorAction,
  removeConnectorAction,
  setConnectorEnabledAction,
  setConnectorToolAction,
} from "@/app/[locale]/(app)/dashboard/ai/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Dialog } from "@/components/app/dialog";
import { EmptyState } from "@/components/app/states";
import { Switch } from "@/components/services-admin/switch";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select } from "@/components/ui/form";
import { CONNECTOR_PRESETS, type ConnectorPreset } from "@/lib/connectors/presets";
import type { ConnectorView } from "@/lib/connectors/service";
import { cn } from "@/lib/utils";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

const AUTH_TYPES = ["none", "bearer", "header", "url_key"] as const;

/**
 * MCP servers connected once for every project: presets (Firecrawl, Exa, Context7) or a custom
 * server. Keys are write-only; a tool that may change something stays off until switched on.
 */
export function ConnectorManager({ connectors }: { connectors: ConnectorView[] }) {
  const t = useTranslations("platform.connectors");
  const [adding, setAdding] = useState<ConnectorPreset | "custom" | null>(null);
  const [removing, setRemoving] = useState<ConnectorView | null>(null);
  const [result, setResult] = useState<{ ok: boolean; code: string; tools: number } | null>(null);
  const { pending, error, run } = useRun();
  const added = new Set(connectors.map((c) => c.preset));

  return (
    <section aria-labelledby="connectors-heading" className="space-y-6">
      <div>
        <h2 id="connectors-heading" className="font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CONNECTOR_PRESETS.map((p) => (
          <div key={p.id} className="flex flex-col rounded-lg border border-border bg-surface p-4">
            <p className="font-medium">{p.name}</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{t(`presets.${p.id}`)}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={added.has(p.id)}
              onClick={() => setAdding(p)}
            >
              {added.has(p.id) ? t("added") : t("add")}
            </Button>
          </div>
        ))}
        <div className="flex flex-col rounded-lg border border-dashed border-border-strong p-4">
          <p className="font-medium">{t("custom")}</p>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{t("customHint")}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding("custom")}>
            {t("add")}
          </Button>
        </div>
      </div>

      {result ? (
        <Notice tone={result.ok ? "success" : "error"}>
          {result.ok
            ? t("result.ok", { count: result.tools })
            : t("result.failed", { reason: result.code })}
        </Notice>
      ) : null}
      <FormError error={error} />

      {connectors.length === 0 ? (
        <EmptyState title={t("listTitle")} body={t("empty")} />
      ) : (
        <ul className="space-y-3" aria-label={t("listTitle")}>
          {connectors.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="truncate font-mono text-xs text-subtle-foreground">{c.endpoint}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(`statuses.${c.status as "connected"}`)} ·{" "}
                    {c.hasCredential ? t("keyStored") : t("noKey")}
                    {c.lastError ? ` · ${c.lastError}` : ""}
                  </p>
                </div>
                <Switch
                  checked={c.enabled}
                  label={t("enabled", { name: c.name })}
                  disabled={pending}
                  onChange={(enabled) =>
                    run(() => setConnectorEnabledAction({ id: c.id, enabled }))
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => connectConnectorAction({ id: c.id }), setResult)}
                >
                  {c.status === "connected" ? t("reconnect") : t("connect")}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setRemoving(c)}>
                  {t("remove")}
                </Button>
              </div>
              {c.tools.length > 0 ? (
                <ul className="mt-3 divide-y divide-border" aria-label={t("tools")}>
                  {c.tools.map((tool) => (
                    <li key={tool.name} className="flex items-center gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs">{tool.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{tool.description}</p>
                      </div>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 text-xs",
                          tool.riskLevel === "low"
                            ? "border-success/40 text-success"
                            : "border-warning/50 text-warning",
                        )}
                      >
                        {t(`risks.${tool.riskLevel as "low"}`)}
                      </span>
                      <Switch
                        checked={tool.enabled}
                        label={t("toolEnabled", { name: tool.name })}
                        disabled={pending}
                        onChange={(enabled) =>
                          run(() => setConnectorToolAction({ id: c.id, tool: tool.name, enabled }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {adding ? <AddDialog preset={adding} onClose={() => setAdding(null)} /> : null}
      <ConfirmDialog
        open={Boolean(removing)}
        title={t("removeTitle", { name: removing?.name ?? "" })}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        pending={pending}
        onConfirm={() =>
          removing &&
          run(
            () => removeConnectorAction({ id: removing.id }),
            () => setRemoving(null),
          )
        }
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}

function AddDialog({
  preset,
  onClose,
}: {
  preset: ConnectorPreset | "custom";
  onClose: () => void;
}) {
  const t = useTranslations("platform.connectors");
  const states = useTranslations("app.states");
  const id = useId();
  const { pending, error, run } = useRun();
  const custom = preset === "custom";
  const submit = (form: FormData) => {
    const secret = String(form.get("secret") ?? "") || undefined;
    run(
      () =>
        custom
          ? addCustomConnectorAction({
              name: String(form.get("name") ?? ""),
              endpoint: String(form.get("endpoint") ?? ""),
              authType: String(form.get("authType") ?? "none"),
              authHeader: String(form.get("authHeader") ?? "") || null,
              secret,
            })
          : addPresetConnectorAction({ preset: preset.id, secret }),
      onClose,
    );
  };
  return (
    <Dialog open onClose={onClose} title={custom ? t("custom") : preset.name}>
      <form action={submit} className="space-y-4">
        {custom ? (
          <>
            <Field id={`${id}-name`} name="name" label={t("name")} required maxLength={60} />
            <Field
              id={`${id}-endpoint`}
              name="endpoint"
              label={t("endpoint")}
              placeholder="https://mcp.example.com/mcp"
              hint={t("endpointHint")}
              required
              maxLength={300}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select id={`${id}-auth`} name="authType" label={t("authType")} defaultValue="bearer">
                {AUTH_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {t(`auth.${a}`)}
                  </option>
                ))}
              </Select>
              <Field
                id={`${id}-header`}
                name="authHeader"
                label={t("authHeader")}
                placeholder="x-api-key"
                maxLength={60}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(`presets.${preset.id}`)}{" "}
            <a
              href={preset.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {t("docs")}
            </a>
          </p>
        )}
        <Field
          id={`${id}-secret`}
          name="secret"
          type="password"
          autoComplete="off"
          label={t("secret")}
          hint={custom || preset.keyRequired ? t("secretHint") : t("secretOptional")}
          required={!custom && preset.keyRequired}
          maxLength={1000}
        />
        <FormError error={error} />
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {states("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
