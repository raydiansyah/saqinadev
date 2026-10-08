"use client";

import { useTranslations } from "next-intl";

/** Uses the visitor's clock, not the server's (UTC), so "good morning" matches their day. */
export function Greeting({ name }: { name: string }) {
  const t = useTranslations("app.greeting");
  const hour = new Date().getHours();
  const key = hour < 11 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return (
    <h1 suppressHydrationWarning className="text-2xl font-semibold tracking-tight">
      {t(key, { name })}
    </h1>
  );
}
