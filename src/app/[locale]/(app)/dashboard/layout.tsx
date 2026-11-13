import { AppHeader } from "@/components/app/app-header";
import { DashboardNav } from "@/components/app/dashboard-nav";
import { requireActorPage } from "@/lib/auth/server";

export default async function DashboardLayout({ children }: LayoutProps<"/[locale]/dashboard">) {
  const actor = await requireActorPage("/dashboard");
  return (
    <>
      <AppHeader actor={actor} />
      <DashboardNav />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
