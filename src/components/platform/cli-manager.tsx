"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { connectCliAction, testProviderAction } from "@/app/[locale]/(app)/dashboard/ai/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import type { CliOverview } from "@/lib/ai/cli/service";
import { cn } from "@/lib/utils";
import { FormError } from "./form-error";
import { useRun } from "./use-run";

/**
 * Local CLIs on the server's own machine, used as AI providers with the CLI's own login and no
 * key. Only the platform Owner sees this. Connecting one adds it to the provider list below,
 * where it is tested, switched off or disconnected like any other.
 */
export function CliManager({ overview }: { overview: CliOverview }) {
  const t = useTranslations("platform.cli");
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [busy, setBusy] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { ok: boolean; code: string }>>({});

  // A refused connection never reaches the test, so the button is freed here.
  useEffect(() => {
    if (error) setBusy(null);
  }, [error]);

  // The connection is made first, then the CLI is asked a question; the page is refreshed after
  // both, so the badge shows the tested state.
  const connectAndTest = (cli: string) => {
    setBusy(cli);
    run(
      () => connectCliAction({ cli }),
      (data: { id: string }) =>
        void testProviderAction({ id: data.id })
          .then((r) => {
            if (r.ok) setTests((s) => ({ ...s, [cli]: r.data }));
          })
          .finally(() => {
            setBusy(null);
            router.refresh();
          }),
    );
  };

  return (
    <section aria-labelledby="cli-heading">
      <h2 id="cli-heading" className="font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
      {overview.enabled ? null : (
        <Notice tone="info" className="mt-3">
          {t("off")} <code className="font-mono text-xs">ALLOW_LOCAL_CLI=1</code>
        </Notice>
      )}
      <FormError error={error} />
      <ul className="mt-4 space-y-3">
        {overview.clis.map((c) => {
          const test = tests[c.id];
          const connected = c.providerId !== null && c.providerStatus !== "disconnected";
          return (
            <li key={c.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.installed
                      ? `${t("installed")}${c.version ? ` · ${c.version}` : ""}`
                      : t("notInstalled")}
                  </p>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    {t("login")}: <code className="font-mono">{c.loginHint}</code>
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-xs",
                    connected
                      ? "border-success/40 text-success"
                      : "border-border text-subtle-foreground",
                  )}
                >
                  {connected ? t("connected") : t("notConnected")}
                </span>
              </div>
              {test ? (
                <Notice tone={test.ok ? "success" : "error"} className="mt-3">
                  {test.ok ? t("testOk") : t("testFailed")}
                </Notice>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null || pending || !overview.enabled || !c.installed}
                  onClick={() => connectAndTest(c.id)}
                >
                  {busy === c.id ? t("working") : connected ? t("recheck") : t("connect")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-subtle-foreground">{t("rescan")}</p>
    </section>
  );
}
