import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("metaTitle"), robots: { index: false } };
}

// Better Auth redirects here with ?token=... or ?error=INVALID_TOKEN.
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/[locale]/reset-password">) {
  const { token, error } = await searchParams;
  const t = await getTranslations("auth.reset");
  return (
    <>
      <AuthHeading title={t("title")} />
      <ResetPasswordForm token={typeof token === "string" && !error ? token : null} />
    </>
  );
}
