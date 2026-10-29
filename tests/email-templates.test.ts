import { describe, expect, it } from "vitest";
import { esc, renderEmail } from "@/lib/email/layout";
import { detectLocale, localeFromPath } from "@/lib/email/locale";
import {
  EVENT_TITLES,
  inquiryEmailMessage,
  inviteEmailMessage,
  notificationEmailMessage,
  resetEmailMessage,
  toLocale,
  verifyEmailMessage,
} from "@/lib/email/templates";

const URL = "https://saqina.dev/api/auth/verify-email?token=abc123";

describe("locale detection", () => {
  it("reads the language from a path or a full URL", () => {
    expect(localeFromPath("/id/sign-up")).toBe("id");
    expect(localeFromPath("/en/dashboard?welcome=1")).toBe("en");
    expect(localeFromPath("https://saqina.dev/id/sign-in")).toBe("id");
    expect(localeFromPath("/id")).toBe("id");
    expect(localeFromPath("/fr/x")).toBeUndefined();
    expect(localeFromPath("/identity/x")).toBeUndefined();
    expect(localeFromPath(null)).toBeUndefined();
  });

  it("prefers the callback page in the action link, then the body, then the referer", () => {
    const url = "https://saqina.dev/api/auth/verify-email?token=t&callbackURL=%2Fid%2Fdashboard";
    expect(detectLocale({ url, referer: "https://saqina.dev/en/sign-up" })).toBe("id");
    expect(
      detectLocale({ url: "/api/auth/verify-email?token=t&callbackURL=%2Fid%2Fdashboard" }),
    ).toBe("id");
    expect(detectLocale({ callbackURL: "/id/dashboard", referer: "https://x/en/y" })).toBe("id");
    expect(detectLocale({ redirectTo: "/id/reset-password" })).toBe("id");
    expect(detectLocale({ referer: "https://saqina.dev/en/forgot-password" })).toBe("en");
    expect(detectLocale({})).toBeUndefined();
    expect(detectLocale({ callbackURL: 42, url: "not a url" })).toBeUndefined();
  });

  it("falls back to the default language for unknown stored values", () => {
    expect(toLocale("id")).toBe("id");
    expect(toLocale("fr")).toBe("en");
    expect(toLocale(null)).toBe("en");
  });
});

describe("email layout", () => {
  it("escapes everything user-controlled", () => {
    expect(esc(`<script>"x"&'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;",
    );
    const { html } = verifyEmailMessage(`<img src=x onerror=alert(1)>`, URL, "en");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("refuses non-http links so a hostile value cannot become a javascript: href", () => {
    const copy = { en: "a", id: "a" };
    const { html } = renderEmail({
      preheader: copy,
      title: copy,
      body: { en: ["x"], id: ["x"] },
      buttons: [{ label: "Go", url: "javascript:alert(1)" }],
    });
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#"');
  });

  it("is branded, and its plain-text twin carries the same single language", () => {
    const m = verifyEmailMessage("Budi", URL, "en");
    expect(m.html).toContain("/brand/logo-mark-light.png");
    expect(m.html).toContain("#FF6A55");
    expect(m.html).toContain('lang="en"');
    expect(m.text).toContain("Confirm your email");
    expect(m.text).toContain(URL);
    expect(m.text).not.toContain("<");
  });

  it("never uses an em dash", () => {
    for (const locale of ["en", "id"] as const)
      for (const m of [
        verifyEmailMessage("A", URL, locale),
        resetEmailMessage("A", URL, locale),
        inviteEmailMessage("Org", "Client", URL, locale),
        notificationEmailMessage("invoice.issued", { number: "INV-1" }, "/portal", locale),
        inquiryEmailMessage("Dewi", "ai-daily-assistant", locale),
      ])
        expect(m.html + m.text + m.subject).not.toContain("—");
  });
});

describe("one language per email", () => {
  it("renders Indonesian only for the id locale", () => {
    const m = verifyEmailMessage("Budi", URL, "id");
    expect(m.subject).toBe("Verifikasi email Saqina Dev Anda");
    expect(m.html).toContain('lang="id"');
    expect(m.html).toContain("Halo Budi,");
    expect(m.html).toContain("Konfirmasi email Anda");
    expect(m.html).not.toContain("Confirm your email");
    expect(m.text).not.toContain("Confirm your email");
  });

  it("renders English only for the en locale", () => {
    const m = resetEmailMessage("Budi", URL, "en");
    expect(m.subject).toBe("Reset your Saqina Dev password");
    expect(m.html).toContain("Hi Budi,");
    expect(m.html).toContain("expires in one hour");
    expect(m.html).not.toContain("Atur ulang");
    expect(m.html).toContain(`href="${URL}"`);
  });

  it("localises subjects, buttons and footers for every message", () => {
    expect(inquiryEmailMessage("A", null, "id").subject).toBe("Pertanyaan layanan baru");
    expect(inquiryEmailMessage("A", null, "en").subject).toBe("New service inquiry");
    expect(inviteEmailMessage("Org", "PT Maju", URL, "id").subject).toBe(
      "Org mengundang Anda ke portal project",
    );
    expect(resetEmailMessage("A", URL, "id").html).toContain("Jika tombol tidak berfungsi");
    expect(resetEmailMessage("A", URL, "en").html).toContain("If the button does not work");
  });

  it("links notifications into the app in the recipient's language", () => {
    const params = { number: "INV-007", project: "Resto POS" };
    const id = notificationEmailMessage("invoice.issued", params, "/portal/p/x", "id");
    expect(id.subject).toBe("Saqina Dev: Invoice baru");
    expect(id.html).toContain("/id/portal/p/x");
    expect(id.html).not.toContain("/en/portal/p/x");
    expect(id.html).toContain("INV-007");
    expect(id.html).toContain("Resto POS");
    const en = notificationEmailMessage("invoice.issued", params, "/portal/p/x", "en");
    expect(en.subject).toBe("Saqina Dev: New invoice");
    expect(en.html).toContain("/en/portal/p/x");
  });

  it("links the inquiry mail to the owner's own language", () => {
    expect(inquiryEmailMessage("Dewi", "svc", "id").html).toContain(
      "/id/dashboard/services/inquiries",
    );
    expect(inquiryEmailMessage("Dewi", "svc", "en").html).toContain(
      "/en/dashboard/services/inquiries",
    );
  });

  it("falls back to a generic title for unknown events and names every known event twice", () => {
    expect(notificationEmailMessage("something.new", {}, null, "id").subject).toBe(
      "Saqina Dev: Pembaruan project",
    );
    for (const [type, title] of Object.entries(EVENT_TITLES)) {
      expect(title.en, type).toBeTruthy();
      expect(title.id, type).toBeTruthy();
    }
  });
});
