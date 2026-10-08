import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <>
      <AuthHeading title={t("title")} />
      <ForgotPasswordForm />
    </>
  );
}
