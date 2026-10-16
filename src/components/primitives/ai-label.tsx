import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The one way Saqina marks output produced by an AI model (EU AI Act Art. 50, transparency).
 * Put it next to any heading or message a person could take for human-written work.
 * The tooltip and the accessible name explain it; the visible text stays short.
 */
export function AiLabel({ className }: { className?: string }) {
  const t = useTranslations("app.ai");
  return (
    <span
      title={t("title")}
      className={cn(
        "inline-flex items-center rounded border border-info/40 px-1.5 py-px align-middle font-mono text-[0.625rem] leading-4 font-medium tracking-wider text-info uppercase",
        className,
      )}
    >
      <span aria-hidden="true">{t("label")}</span>
      <span className="sr-only">{t("title")}</span>
    </span>
  );
}
