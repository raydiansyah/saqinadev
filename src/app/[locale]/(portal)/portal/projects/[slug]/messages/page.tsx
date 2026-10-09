import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { MessageForm } from "@/components/portal/engagement/message-form";
import { clientMessageList } from "@/lib/portal/engagement-views";
import { cn } from "@/lib/utils";
import { portalPageAccess } from "../../../access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portalEngagement.messages");
  return { title: t("metaTitle") };
}

const tag = (locale: string) => (locale === "id" ? "id-ID" : "en-GB");

export default async function PortalMessagesPage({
  params,
}: PageProps<"/[locale]/portal/projects/[slug]/messages">) {
  const { slug } = await params;
  const messages = await clientMessageList(await portalPageAccess(slug));
  const [t, locale] = await Promise.all([
    getTranslations("portalEngagement.messages"),
    getLocale(),
  ]);
  const stamp = new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-muted-foreground">{t("description")}</p>
      </div>

      {messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol aria-label={t("threadLabel")} className="space-y-4">
          {messages.map((m) => {
            const team = m.side === "team";
            return (
              <li key={m.id} className={cn("flex", team ? "justify-start" : "justify-end")}>
                <article
                  className={cn(
                    "max-w-[85%] min-w-0 rounded-lg border px-4 py-3 sm:max-w-[75%]",
                    team ? "border-border bg-surface" : "border-primary/30 bg-primary/5",
                  )}
                >
                  <header className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {m.authorName ?? (team ? t("team") : t("client"))}
                    </span>
                    {team ? <span>{t("teamSide")}</span> : null}
                    <time dateTime={m.createdAt.toISOString()}>{stamp.format(m.createdAt)}</time>
                  </header>
                  <p className="mt-1 text-sm break-words whitespace-pre-line">{m.body}</p>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      <MessageForm slug={slug} />
    </div>
  );
}
