"use client";

import { useLocale, useTranslations } from "next-intl";
import { type SubmitEvent, useId, useState, useTransition } from "react";
import { createProjectAction } from "@/app/[locale]/(app)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";

export function NewProjectForm({ clients }: { clients: { id: string; label: string }[] }) {
  const t = useTranslations("app");
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError(t("newProject.tooShort"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createProjectAction({
        name: name.trim(),
        description: description.trim(),
        clientId: clientId || null,
        locale,
      });
      if (!result.ok) {
        setError(
          result.code === "VALIDATION_ERROR"
            ? t("newProject.tooShort")
            : t(`errors.${result.code}`),
        );
        return;
      }
      router.push(`/project/${result.data.slug}/billing`);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-busy={pending}>
      <Field
        id={`${id}-name`}
        label={t("newProject.nameLabel")}
        placeholder={t("newProject.namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        error={error ?? undefined}
        required
      />
      <Select
        id={`${id}-client`}
        label={t("newProject.clientLabel")}
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
      >
        <option value="">{t("newProject.clientNone")}</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
      <TextArea
        id={`${id}-description`}
        label={t("newProject.descriptionLabel")}
        hint={t("newProject.descriptionHint")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={2000}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("newProject.pending") : t("newProject.submit")}
      </Button>
    </form>
  );
}
