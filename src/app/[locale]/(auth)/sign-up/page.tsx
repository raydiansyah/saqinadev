import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/components/auth/auth-heading";
import { SignUpForm } from "@/components/auth/sign-up-form";
import type { Locale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { isGoogleEnabled } from "@/lib/auth/config";
import { safeNext } from "@/lib/auth/redirect";
import { getActor } from "@/lib/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function SignUpPage({ params, searchParams }: PageProps<"/[locale]/sign-up">) {
  const locale = (await params).locale as Locale;
  const next = (await searchParams).next;
  if (await getActor()) {
    const target = safeNext(typeof next === "string" ? next : null, locale);
    redirect({ href: target.replace(`/${locale}`, "") || "/dashboard", locale });
  }
  const t = await getTranslations("auth.signUp");
  return (
    <>
      <AuthHeading title={t("title")} />
      <SignUpForm next={typeof next === "string" ? next : null} googleEnabled={isGoogleEnabled()} />
    </>
  );
}
