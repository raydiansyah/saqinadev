import { ImageResponse } from "next/og";
import { getSiteContent } from "@/content/site";
import { isLocale } from "@/i18n/locales";

export const alt = "Saqina Dev";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { hero, meta } = getSiteContent(isLocale(locale) ? locale : "en");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#1c1916",
        color: "#f5f3f0",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 30, color: "#FF6A55" }}>saqina.dev</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: -2 }}>{hero.title}</div>
        <div style={{ fontSize: 40, color: "#c2bdb4" }}>{meta.ogSubtitle}</div>
      </div>
      <div style={{ fontSize: 26, color: "#8f8a80" }}>{meta.ogFooter}</div>
    </div>,
    size,
  );
}
