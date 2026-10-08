import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function ProjectNotFound() {
  const t = await getTranslations("app.states");
  return (
    <main id="main" className="mx-auto max-w-md flex-1 px-5 py-24 text-center">
      <h1 className="text-xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/dashboard/projects" className={buttonVariants({ className: "mt-6" })}>
        {t("backToProjects")}
      </Link>
    </main>
  );
}
