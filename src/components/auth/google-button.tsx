"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/client";

/** OAuth redirect. Errors come back as ?error= on the sign-in page. */
export function GoogleButton({ callbackURL, errorURL }: { callbackURL: string; errorURL: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const { error } = await signIn.social({
          provider: "google",
          callbackURL,
          errorCallbackURL: errorURL,
        });
        // On success the browser navigates away; only failures land here.
        if (error) {
          setPending(false);
          window.location.assign(`${errorURL}${errorURL.includes("?") ? "&" : "?"}error=oauth`);
        }
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.35 11.1H12v2.98h5.35c-.23 1.43-1.66 4.2-5.35 4.2a5.95 5.95 0 0 1 0-11.9c1.85 0 3.1.79 3.8 1.47l2.6-2.5C16.74 3.82 14.6 2.8 12 2.8a9.2 9.2 0 1 0 0 18.4c5.3 0 8.82-3.73 8.82-8.98 0-.6-.07-1.06-.15-1.52Z"
        />
      </svg>
      {pending ? t("googleRedirecting") : t("google")}
    </Button>
  );
}

export function Divider() {
  const t = useTranslations("auth");
  return (
    <div className="flex items-center gap-3 text-xs text-subtle-foreground" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      {t("or")}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
