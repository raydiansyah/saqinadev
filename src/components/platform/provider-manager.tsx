"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  createProviderAction,
  disconnectProviderAction,
  setProviderEnabledAction,
  testProviderAction,
  updateProviderAction,
} from "@/app/[locale]/(app)/dashboard/ai/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Dialog } from "@/components/app/dialog";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Field, Notice, Select } from "@/components/ui/form";
import type { ProviderView } from "@/lib/ai/control-plane";
import { PROVIDER_ADAPTERS, PROVIDER_TYPES } from "@/lib/domain/enums";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

const TONE: Record<string, string> = {
  connected: "border-success/40 text-success",
  unauthorized: "border-error/50 text-error",
  error: "border-error/50 text-error",
  disabled: "border-border text-subtle-foreground",
  disconnected: "border-border text-subtle-foreground",
  untested: "border-border-strong text-muted-foreground",
};

/** Providers with write-only secrets, test, enable/disable and disconnect. */
export function ProviderManager({ providers }: { providers: ProviderView[] }) {
  const t = useTranslations("platform.providers");
  const locale = useLocale();
  const [editing, setEditing] = useState<ProviderView | "new" | null>(null);
  const [confirm, setConfirm] = useState<ProviderView | null>(null);
  const [tests, setTests] = useState<
    Record<string, { ok: boolean; code: string; models: string[] }>
  >({});
  const { pending, error, run } = useRun();

  return (
    <section aria-labelledby="providers-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="providers-heading" className="font-semibold">
          {t("title")}
        </h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          {t("add")}
        </Button>
      </div>
      <FormError error={error} />
      {providers.length === 0 ? (
        <EmptyState className="mt-4" title={t("title")} body={t("empty")} />
      ) : (
        <ul className="mt-4 space-y-3">
          {providers.map((p) => {
            const test = tests[p.id];
            return (
              <li key={p.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`adapters.${p.adapter}`)} · {t(`types.${p.type}`)} ·{" "}
                      {t("models", { count: p.modelCount })}
                    </p>
                    {p.baseUrl ? (
                      <p className="mt-0.5 truncate font-mono text-xs text-subtle-foreground">
                        {p.baseUrl}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("credential")}: {p.hasCredential ? t("connected") : t("notConnected")} ·{" "}
                      {p.lastTestedAt
                        ? t("lastTested", {
                            time: formatRelative(new Date(p.lastTestedAt), locale),
                          })
                        : t("never")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-xs",
                      TONE[p.status] ?? TONE.untested,
                    )}
                  >
                    {t(`statuses.${p.status as "connected"}`)}
                  </span>
                </div>
                {test ? (
                  <Notice tone={test.ok ? "success" : "error"} className="mt-3">
                    {test.ok
                      ? t("testOk")
                      : t("testFailed", { reason: t(`reasons.${test.code as "network"}`) })}
                    {test.ok && test.models.length
                      ? ` ${t("testModels", { list: test.models.slice(0, 8).join(", ") })}`
                      : ""}
                  </Notice>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => testProviderAction({ id: p.id }),
                        (data) => setTests((s) => ({ ...s, [p.id]: data })),
                      )
                    }
                  >
                    {pending ? t("testing") : t("test")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    {t("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(() => setProviderEnabledAction({ id: p.id, enabled: !p.enabled }))
                    }
                  >
                    {p.enabled ? t("disable") : t("enable")}
                  </Button>
                  {p.hasCredential ? (
                    <Button size="sm" variant="danger" onClick={() => setConfirm(p)}>
                      {t("disconnect")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <ProviderDialog
          provider={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={t("disconnectTitle", { name: confirm?.name ?? "" })}
        body={t("disconnectBody")}
        confirmLabel={t("disconnect")}
        pending={pending}
        onConfirm={() =>
          confirm &&
          run(
            () => disconnectProviderAction({ id: confirm.id }),
            () => setConfirm(null),
          )
        }
        onClose={() => setConfirm(null)}
      />
    </section>
  );
}

function ProviderDialog({
  provider,
  onClose,
}: {
  provider: ProviderView | null;
  onClose: () => void;
}) {
  const t = useTranslations("platform.providers");
  const states = useTranslations("app.states");
  const id = useId();
  const { pending, error, run } = useRun();
  const submit = (form: FormData) => {
    const values = {
      name: String(form.get("name") ?? ""),
      type: String(form.get("type")),
      adapter: String(form.get("adapter")),
      baseUrl: String(form.get("baseUrl") ?? "") || null,
      secret: String(form.get("secret") ?? "") || undefined,
    };
    run(
      () =>
        provider
          ? updateProviderAction({ id: provider.id, ...values })
          : createProviderAction(values),
      onClose,
    );
  };
  return (
    <Dialog open onClose={onClose} title={provider ? provider.name : t("add")}>
      <form action={submit} className="space-y-4">
        <Field
          id={`${id}-name`}
          name="name"
          label={t("name")}
          defaultValue={provider?.name}
          required
          maxLength={60}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id={`${id}-adapter`}
            name="adapter"
            label={t("adapter")}
            defaultValue={provider?.adapter ?? "anthropic"}
          >
            {PROVIDER_ADAPTERS.map((a) => (
              <option key={a} value={a}>
                {t(`adapters.${a}`)}
              </option>
            ))}
          </Select>
          <Select
            id={`${id}-type`}
            name="type"
            label={t("type")}
            defaultValue={provider?.type ?? "managed"}
          >
            {PROVIDER_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`types.${x}`)}
              </option>
            ))}
          </Select>
        </div>
        <Field
          id={`${id}-base`}
          name="baseUrl"
          label={t("baseUrl")}
          hint={t("baseUrlHint")}
          defaultValue={provider?.baseUrl ?? ""}
          maxLength={300}
        />
        <Field
          id={`${id}-secret`}
          name="secret"
          type="password"
          autoComplete="off"
          label={t("secret")}
          hint={t("secretHint")}
          maxLength={500}
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
