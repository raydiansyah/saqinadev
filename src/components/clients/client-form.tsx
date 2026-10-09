"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  createClientAction,
  updateClientAction,
} from "@/app/[locale]/(app)/dashboard/clients/actions";
import { FormError } from "@/components/platform/form-error";
import { useRun } from "@/components/platform/use-run";
import { Button } from "@/components/ui/button";
import { Field, Notice, TextArea } from "@/components/ui/form";
import type { ClientStatus } from "@/lib/domain/business";

export interface ClientValues {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  internalNotes: string;
}

const EMPTY: ClientValues = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address: "",
  internalNotes: "",
};

function read(form: HTMLFormElement): ClientValues {
  const data = new FormData(form);
  const get = (k: keyof ClientValues) => String(data.get(k) ?? "");
  return {
    name: get("name"),
    company: get("company"),
    email: get("email"),
    phone: get("phone"),
    address: get("address"),
    internalNotes: get("internalNotes"),
  };
}

/**
 * Create or edit a client. Editing keeps the current status; archiving is a separate control.
 * `onCreated` receives the new id so the caller can navigate to it.
 */
export function ClientForm({
  clientId,
  status = "active",
  initial = EMPTY,
  onCreated,
}: {
  clientId?: string;
  status?: ClientStatus;
  initial?: ClientValues;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("clients.form");
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  const prefix = clientId ? `client-${clientId.slice(0, 8)}` : "client-new";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        const values = read(e.currentTarget);
        if (clientId)
          run(
            () => updateClientAction(clientId, { ...values, status }),
            () => setSaved(true),
          );
        else
          run<{ id: string }>(
            () => createClientAction(values),
            (data) => onCreated?.(data.id),
          );
      }}
    >
      <Field
        id={`${prefix}-name`}
        name="name"
        label={t("name")}
        defaultValue={initial.name}
        required
        minLength={2}
        maxLength={120}
        autoComplete="off"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${prefix}-company`}
          name="company"
          label={t("company")}
          defaultValue={initial.company}
          maxLength={160}
          autoComplete="off"
        />
        <Field
          id={`${prefix}-email`}
          name="email"
          type="email"
          label={t("email")}
          defaultValue={initial.email}
          maxLength={200}
          autoComplete="off"
        />
      </div>
      <Field
        id={`${prefix}-phone`}
        name="phone"
        type="tel"
        label={t("phone")}
        defaultValue={initial.phone}
        maxLength={40}
        autoComplete="off"
      />
      <TextArea
        id={`${prefix}-address`}
        name="address"
        label={t("address")}
        defaultValue={initial.address}
        maxLength={400}
        rows={2}
      />
      <TextArea
        id={`${prefix}-notes`}
        name="internalNotes"
        label={t("internalNotes")}
        hint={t("internalNotesHint")}
        defaultValue={initial.internalNotes}
        maxLength={4000}
        rows={3}
      />
      <FormError error={error} />
      {saved && !error ? <Notice tone="success">{t("saved")}</Notice> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {clientId ? (pending ? t("saving") : t("save")) : pending ? t("creating") : t("create")}
        </Button>
      </div>
    </form>
  );
}
