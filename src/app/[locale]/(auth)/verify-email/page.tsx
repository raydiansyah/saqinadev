import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/components/auth/auth-heading";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.verify");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** Landing page for expired or reused verification links (Better Auth adds ?error=). */
export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/[locale]/verify-email">) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.verify");
  const invalid = typeof error === "string";
  return (
    <>
      <AuthHeading title={invalid ? t("invalidTitle") : t("title")} />
      <p className="text-muted-foreground">{invalid ? t("invalidBody") : t("body")}</p>
      <Link href="/sign-in" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
        {(await getTranslations("auth.signUp"))("signIn")}
      </Link>
    </>
  );
}
