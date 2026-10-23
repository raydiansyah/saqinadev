"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  setDocumentSharedAction,
  signDocumentAction,
} from "@/app/[locale]/(app)/project/[slug]/documents/actions";
import {
  requestDocumentChangesAction,
  signDocumentClientAction,
} from "@/app/[locale]/(portal)/portal/projects/[slug]/documents/actions";
import { Dialog } from "@/components/app/dialog";
import { EngagementError } from "@/components/engagement/engagement-error";
import { useRun } from "@/components/platform/use-run";
import { LocalTime } from "@/components/primitives/local-time";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/form";
import type { SigningView } from "@/lib/documents/signing";
import { cn } from "@/lib/utils";

/**
 * Where a proposal, agreement, handover or maintenance agreement stands: the text approved, each
 * party's signature, and the reference number once both have signed. The team and the client
 * see the same panel; each only gets the buttons that are theirs.
 */
export function SigningPanel({
  side,
  projectSlug,
  docSlug,
  view,
  canAct,
}: {
  side: "team" | "client";
  projectSlug: string;
  docSlug: string;
  view: SigningView;
  /** Whether this reader may sign (a team viewer may look, not sign). */
  canAct: boolean;
}) {
  const t = useTranslations("documents.signing");
  const id = useId();
  const { pending, error, run } = useRun();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  if (!view.signable) return null;

  const issued = view.status === "signed" && view.reference !== null;
  const approved = view.status === "approved" || view.status === "signed";
  const sig = (party: "team" | "client") => view.signatures.find((s) => s.party === party);
  const mine = sig(side);
  const canSign = canAct && view.status === "approved" && !mine;

  const row = (label: string, done: boolean, detail: React.ReactNode) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span
        aria-hidden="true"
        className={cn("font-mono", done ? "text-success" : "text-subtle-foreground")}
      >
        {done ? "✓" : "○"}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{label}</span>
        <span className="sr-only">: {done ? t("done") : t("waiting")}</span>
      </span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </li>
  );
  const signedBy = (party: "team" | "client") => {
    const s = sig(party);
    return s ? (
      <>
        {t("signedBy", { name: s.name })} · <LocalTime iso={s.signedAt} />
      </>
    ) : (
      t("waiting")
    );
  };

  return (
    <section
      aria-labelledby={`${id}-h`}
      className="mt-4 rounded-lg border border-border p-4 sm:p-5"
    >
      <h2 id={`${id}-h`} className="font-semibold">
        {t("title")}
      </h2>
      {issued ? (
        <p className="mt-2 text-sm text-success" role="status">
          {t("issued", { reference: view.reference ?? "" })}
          {view.issuedAt ? (
            <>
              {" · "}
              <LocalTime iso={view.issuedAt} />
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t(`hint.${side}`)}</p>
      )}
      <ul className="mt-3 divide-y divide-border">
        {row(t("steps.approved"), approved, approved ? t("done") : t("waiting"))}
        {row(t("steps.team"), Boolean(sig("team")), signedBy("team"))}
        {row(t("steps.client"), Boolean(sig("client")), signedBy("client"))}
        {row(t("steps.issued"), issued, issued ? view.reference : t("afterBoth"))}
      </ul>

      {canSign ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              run(() =>
                side === "team"
                  ? signDocumentAction(projectSlug, docSlug)
                  : signDocumentClientAction(projectSlug, docSlug),
              )
            }
          >
            {t(`sign.${side}`)}
          </Button>
          {side === "client" ? (
            <Button variant="outline" disabled={pending} onClick={() => setAsking(true)}>
              {t("requestChanges")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {/* The client can only sign what they can read: sharing is the team's step. */}
      {side === "team" && canAct && view.status === "approved" && !view.clientVisible ? (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{t("shareFirst")}</p>
          <Button
            className="mt-2"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => setDocumentSharedAction(projectSlug, docSlug, true))}
          >
            {t("share")}
          </Button>
        </div>
      ) : null}
      {!issued && !approved && side === "team" ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("approveFirst")}</p>
      ) : null}
      <p className="mt-3 text-xs text-subtle-foreground">{t("editNote")}</p>
      <EngagementError error={error} />

      <Dialog open={asking} onClose={() => setAsking(false)} title={t("changesTitle")}>
        <div className="space-y-4">
          <TextArea
            id={`${id}-note`}
            label={t("changesLabel")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={2000}
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={pending || note.trim().length < 3}
              onClick={() => {
                setAsking(false);
                run(() => requestDocumentChangesAction(projectSlug, docSlug, note));
                setNote("");
              }}
            >
              {t("sendChanges")}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
