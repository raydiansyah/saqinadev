import { describe, expect, it } from "vitest";
import { formatStamp, formatTooltip } from "@/lib/format";

const at = new Date("2026-10-15T07:20:30Z");

describe("formatStamp", () => {
  it("shows date and time in the given timezone, in each language", () => {
    expect(formatStamp(at, "en", { timeZone: "UTC" })).toMatch(/Oct 15, 2026.*7:20/);
    expect(formatStamp(at, "id", { timeZone: "UTC" })).toMatch(/15 Okt 2026.*07\.20/);
    expect(formatStamp(at, "en", { timeZone: "Asia/Jakarta" })).toMatch(/2:20/);
  });

  it("can show the date alone", () => {
    const text = formatStamp(at, "en", { dateOnly: true, timeZone: "UTC" });
    expect(text).toBe("Oct 15, 2026");
  });
});

describe("formatTooltip", () => {
  it("does not throw on the option mix it uses, and names the timezone and the age", () => {
    const text = formatTooltip(at, "en", new Date("2026-10-15T07:25:30Z"));
    expect(text).toMatch(/Thursday, October 15, 2026/);
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(text).toMatch(/5 minutes ago/);
    expect(() => formatTooltip(at, "id")).not.toThrow();
  });
});
