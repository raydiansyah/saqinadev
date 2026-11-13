import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewProjectForm } from "@/components/app/new-project-form";
import { requireActorPage } from "@/lib/auth/server";
import { listClientOptions } from "@/lib/clients/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.newProject");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function NewProjectPage() {
  const actor = await requireActorPage("/dashboard/new");
  const [t, clients] = await Promise.all([
    getTranslations("app.newProject"),
    listClientOptions(actor),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {t("title")}
      </h1>
      <p className="mt-2 mb-8 text-muted-foreground">{t("body")}</p>
      <NewProjectForm
        clients={clients.map((c) => ({
          id: c.id,
          label: c.company ? `${c.name} · ${c.company}` : c.name,
        }))}
      />
    </div>
  );
}
