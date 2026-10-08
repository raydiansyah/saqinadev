import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewProjectForm } from "@/components/app/new-project-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.newProject");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function NewProjectPage() {
  const t = await getTranslations("app.newProject");
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {t("title")}
      </h1>
      <p className="mt-2 mb-8 text-muted-foreground">{t("body")}</p>
      <NewProjectForm />
    </div>
  );
}
