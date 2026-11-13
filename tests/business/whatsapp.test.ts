import { describe, expect, it, vi } from "vitest";
import { getWhatsappSender, whatsappText } from "@/lib/notifications/channels/whatsapp";

vi.mock("server-only", () => ({}));

describe("whatsappText", () => {
  it("names the sender, the event and the details, then links to the portal", () => {
    const text = whatsappText(
      "reminder.invoice_overdue",
      { number: "INV-2026-001", amount: "Rp 1.000.000", due: "2026-10-01", project: "Website" },
      "/portal/projects/website-x/invoices/abc",
      "en",
      "Studio Biru",
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe("Studio Biru");
    expect(lines[1]).toBe("Invoice overdue");
    expect(lines[2]).toBe("INV-2026-001 · Rp 1.000.000 · 2026-10-01 · Website");
    expect(lines[3]).toMatch(/\/en\/portal\/projects\/website-x\/invoices\/abc$/);
  });

  it("writes in the recipient's language and finds titles for client reminders", () => {
    const text = whatsappText(
      "client.reminder.invoice",
      { project: "Web" },
      null,
      "id",
      "Saqina Dev",
    );
    expect(text.split("\n")[1]).toBe("Pengingat");
  });
});

describe("the console sender", () => {
  it("sends in development and test, and reports skipped in production", async () => {
    const sender = getWhatsappSender({ WHATSAPP_PROVIDER: "anything-unknown" });
    expect(sender.name).toBe("console");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sender.send({ to: "+62812000000000", text: "hello" })).toBe("sent");
    expect(info.mock.calls.flat().join(" ")).not.toContain("6281200000000");
    info.mockRestore();

    vi.stubEnv("NODE_ENV", "production");
    expect(await sender.send({ to: "+62812000000000", text: "hello" })).toBe("skipped");
    vi.unstubAllEnvs();
  });
});
