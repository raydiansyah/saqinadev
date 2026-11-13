import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["+62 812 0000 0000", "+6281200000000"],
    ["0812-0000-0000", "+6281200000000"],
    ["(0812) 0000 0000", "+6281200000000"],
    ["6281200000000", "+6281200000000"],
    ["81200000000", "+6281200000000"],
    ["0062 812 0000 0000", "+6281200000000"],
    ["+1 (415) 555-0132", "+14155550132"],
    ["+65 8123 4567", "+6581234567"],
  ])("%s becomes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "abc",
    "12345",
    "+0 123 456 789",
    "+62",
    "0",
    "9999999999999999999",
  ])("refuses %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("masks a number for the logs", () => {
    expect(maskPhone("+6281200000000")).toBe("+62***0000");
    expect(maskPhone("+6281200000000")).not.toContain("8120");
  });
});
