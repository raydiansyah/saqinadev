"use client";

import { useLocale } from "next-intl";
import { useId, useState } from "react";
import { Section } from "@/components/primitives/section";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import type { SiteContent } from "@/content/site";
import { formatMoney, toMinor } from "@/lib/money";
import { receiptWords } from "@/lib/money-words";
import { cn } from "@/lib/utils";

type Demo = SiteContent["demo"];

const MAX_DIGITS = 11;

/**
 * A small, honest preview of the rule behind receipts: recording a payment issues the receipt in
 * the same step. Local only: nothing is sent or stored, and the numbers are samples.
 */
export function ReceiptDemo({ content: c }: { content: Demo }) {
  const locale = useLocale() === "id" ? "id" : "en";
  const clientId = useId();
  const amountId = useId();
  const [client, setClient] = useState("");
  const [digits, setDigits] = useState("14750000");
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState(false);

  const amount = Number(digits || "0");
  const minor = toMinor(amount, "IDR");
  const money = (n: number) => formatMoney(toMinor(n, "IDR"), "IDR", locale);

  const record = () => {
    if (amount <= 0) {
      setError(true);
      return;
    }
    setError(false);
    setPaid(true);
  };

  return (
    <Section id="try" file={c.file} title={c.title} intro={c.body} layout="split">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form
          data-reveal
          className="space-y-5 rounded-lg border border-border bg-surface p-6"
          onSubmit={(e) => {
            e.preventDefault();
            record();
          }}
          noValidate
        >
          <Field
            id={clientId}
            label={c.clientLabel}
            placeholder={c.clientPlaceholder}
            value={client}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => setClient(e.target.value)}
          />
          <Field
            id={amountId}
            label={c.amountLabel}
            inputMode="numeric"
            autoComplete="off"
            value={
              digits
                ? new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US").format(amount)
                : ""
            }
            error={error ? c.amountError : undefined}
            onChange={(e) => {
              setDigits(e.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS).replace(/^0+/, ""));
              setPaid(false);
              setError(false);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={paid}>
              {c.record}
            </Button>
            {paid ? (
              <Button type="button" variant="outline" onClick={() => setPaid(false)}>
                {c.reset}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-subtle-foreground">{c.note}</p>
        </form>

        <div className="grid content-start gap-4" aria-live="polite">
          <article
            data-reveal
            className="rounded-lg border border-border bg-surface p-6"
            aria-label={c.invoice}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-subtle-foreground">{c.invoice}</p>
                <p className="mt-1 text-lg font-semibold">INV-2026-001</p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold",
                  paid
                    ? "border-success text-success"
                    : "border-border-strong text-muted-foreground",
                )}
              >
                {paid ? `✓ ${c.paid}` : c.sent}
              </span>
            </div>
            <p
              className={cn("mt-4 text-sm", client ? "text-foreground" : "text-subtle-foreground")}
            >
              {client || c.clientPlaceholder}
            </p>
            <p className="mt-4 border-t border-border pt-4 text-2xl font-semibold tabular-nums">
              {money(amount)}
            </p>
          </article>

          {paid ? (
            <article
              key="receipt"
              className="rounded-lg border border-primary/60 bg-surface-raised p-6 [animation:node-morph_420ms_ease-out_both] motion-reduce:animate-none"
              aria-label={c.receipt}
            >
              <p className="font-mono text-xs text-primary">{c.receipt}</p>
              <p className="mt-1 text-lg font-semibold">KWT-2026-001</p>
              <p className="mt-4 text-xs text-subtle-foreground">{c.words}</p>
              <p className="mt-1 text-pretty">{receiptWords(minor, "IDR", locale)}</p>
            </article>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-6 py-5 text-sm text-muted-foreground">
              {c.waiting}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}
