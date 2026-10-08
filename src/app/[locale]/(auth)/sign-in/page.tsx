import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthHeading } from "@/components/auth/auth-heading";
import { SignInForm } from "@/components/auth/sign-in-form";
import type { Locale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { isGoogleEnabled } from "@/lib/auth/config";
import { safeNext } from "@/lib/auth/redirect";
import { getActor } from "@/lib/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("metaTitle"), robots: { index: false } };
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

export default async function SignInPage({ params, searchParams }: PageProps<"/[locale]/sign-in">) {
  const locale = (await params).locale as Locale;
  const query = await searchParams;
  const next = param(query.next);
  if (await getActor()) {
    redirect({ href: safeNext(next, locale).replace(`/${locale}`, "") || "/dashboard", locale });
  }
  const t = await getTranslations("auth.signIn");
  const notice =
    param(query.error) !== null
      ? "oauth"
      : query.reason === "expired"
        ? "sessionExpired"
        : query.reason === "signed-out"
          ? "signedOut"
          : next
            ? "continueTo"
            : null;

  return (
    <>
      <AuthHeading title={t("title")} />
      <SignInForm next={next} googleEnabled={isGoogleEnabled()} notice={notice} />
    </>
  );
}
