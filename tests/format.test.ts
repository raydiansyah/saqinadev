import { describe, expect, it } from "vitest";
import { formatLongDate, formatStamp, formatTooltip } from "@/lib/format";

const at = new Date("2026-10-15T07:20:30Z");

describe("formatStamp", () => {
  it("shows date and time in the given timezone, in each language", () => {
    expect(formatStamp(at, "en", { timeZone: "UTC" })).toMatch(/15 October 2026.*07:20/);
    expect(formatStamp(at, "id", { timeZone: "UTC" })).toMatch(/15 Oktober 2026.*07\.20/);
    expect(formatStamp(at, "en", { timeZone: "Asia/Jakarta" })).toMatch(/14:20/);
  });

  it("can show the date alone", () => {
    const text = formatStamp(at, "en", { dateOnly: true, timeZone: "UTC" });
    expect(text).toBe("15 October 2026");
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

describe("long dates", () => {
  it("writes the month in full, day first: 27 Februari 2027", () => {
    expect(formatLongDate("2027-02-27", "id")).toBe("27 Februari 2027");
    expect(formatLongDate("2027-02-27", "en")).toBe("27 February 2027");
    expect(formatLongDate(new Date("2026-10-23T23:30:00Z"), "id")).toBe("23 Oktober 2026");
  });

  it("never shifts the day with the timezone, and keeps text it cannot read", () => {
    expect(formatLongDate("2027-01-01", "id")).toBe("1 Januari 2027");
    expect(formatLongDate("not a date", "id")).toBe("not a date");
  });
});
