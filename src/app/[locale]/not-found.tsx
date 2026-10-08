import { useTranslations } from "next-intl";
import { Container } from "@/components/primitives/container";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("common");
  return (
    <main id="main" className="flex flex-1 items-center py-24">
      <Container className="max-w-xl">
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("notFound.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("notFound.body")}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className={buttonVariants()}>
            {t("notFound.home")}
          </Link>
          <Link href="/dashboard/new" className={buttonVariants({ variant: "outline" })}>
            {t("startProject")}
          </Link>
        </div>
      </Container>
    </main>
  );
}
