"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  bulkDeleteRequirementsAction,
  bulkUpdateRequirementsAction,
} from "@/app/[locale]/(app)/project/[slug]/requirements/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Notice, Select } from "@/components/ui/form";
import {
  PRIORITIES,
  REQUIREMENT_GROUPS,
  REQUIREMENT_STATUSES,
  type RequirementGroup,
} from "@/lib/domain/enums";

/**
 * What can be done to the selected requirements at once: change status, priority or group
 * (only the fields that are chosen change), or delete them after a confirmation.
 */
export function BulkBar({
  slug,
  ids,
  groupLabels,
  onDone,
}: {
  slug: string;
  ids: string[];
  groupLabels: Record<RequirementGroup, string>;
  /** Called after a change went through: the selection is no longer meaningful. */
  onDone: () => void;
}) {
  const t = useTranslations("requirements");
  const bulk = useTranslations("requirements.bulk");
  const states = useTranslations("app.states");
  const errors = useTranslations("app.errors");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [group, setGroup] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = Boolean(status || priority || group);

  function apply() {
    const patch = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(group ? { group } : {}),
    };
    startTransition(async () => {
      const result = await bulkUpdateRequirementsAction(slug, { ids, patch });
      if (!result.ok) {
        setMessage({ tone: "error", text: errors(result.code) });
        return;
      }
      setMessage({ tone: "success", text: bulk("applied", { count: result.data.updated }) });
      setStatus("");
      setPriority("");
      setGroup("");
      onDone();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await bulkDeleteRequirementsAction(slug, { ids });
      setConfirming(false);
      if (!result.ok) {
        setMessage({ tone: "error", text: errors(result.code) });
        return;
      }
      setMessage({ tone: "success", text: bulk("deleted", { count: result.data.deleted }) });
      onDone();
    });
  }

  return (
    <section
      aria-label={bulk("title")}
      className="sticky bottom-3 z-10 space-y-3 rounded-lg border border-primary/50 bg-surface p-4 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {bulk("selected", { count: ids.length })}
        </p>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          {bulk("clear")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          id="bulk-status"
          label={bulk("status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{bulk("unchanged")}</option>
          {REQUIREMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          id="bulk-priority"
          label={bulk("priority")}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">{bulk("unchanged")}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`priorities.${p}`)}
            </option>
          ))}
        </Select>
        <Select
          id="bulk-group"
          label={bulk("group")}
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">{bulk("unchanged")}</option>
          {REQUIREMENT_GROUPS.map((g) => (
            <option key={g} value={g}>
              {groupLabels[g]}
            </option>
          ))}
        </Select>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={pending}>
          {bulk("delete")}
        </Button>
        <Button size="sm" onClick={apply} disabled={!chosen || pending}>
          {bulk("apply")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={bulk("deleteTitle")}
        body={bulk("deleteBody", { count: ids.length })}
        confirmLabel={states("delete")}
        pending={pending}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
}
