import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/primitives/logo";
import { Link } from "@/i18n/navigation";

export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("auth");
  const common = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-sm"
          aria-label={common("home")}
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
          >
            {t("backHome")}
          </Link>
        </div>
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-5 pt-8 pb-16 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
