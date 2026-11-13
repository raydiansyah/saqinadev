import { describe, expect, it } from "vitest";
import { amountInWords, receiptWords } from "@/lib/money-words";

describe("amountInWords (Indonesian)", () => {
  it.each([
    [0, "nol"],
    [1, "satu"],
    [11, "sebelas"],
    [15, "lima belas"],
    [21, "dua puluh satu"],
    [100, "seratus"],
    [111, "seratus sebelas"],
    [200, "dua ratus"],
    [1000, "seribu"],
    [1500, "seribu lima ratus"],
    [2000, "dua ribu"],
    [11_000, "sebelas ribu"],
    [100_000, "seratus ribu"],
    [1_000_000, "satu juta"],
    [25_000_000, "dua puluh lima juta"],
    [1_001_001, "satu juta seribu satu"],
    [2_500_000_000, "dua miliar lima ratus juta"],
  ])("%i is %s", (value, words) => {
    expect(amountInWords(value, "id")).toBe(words);
  });
});

describe("amountInWords (English)", () => {
  it.each([
    [0, "zero"],
    [13, "thirteen"],
    [42, "forty-two"],
    [100, "one hundred"],
    [1234, "one thousand two hundred thirty-four"],
    [1_000_000, "one million"],
    [1_234_567, "one million two hundred thirty-four thousand five hundred sixty-seven"],
  ])("%i is %s", (value, words) => {
    expect(amountInWords(value, "en")).toBe(words);
  });
});

describe("receiptWords", () => {
  it("names the currency and writes a minor unit as a fraction", () => {
    expect(receiptWords(25_000_000, "IDR", "id")).toBe("dua puluh lima juta rupiah");
    expect(receiptWords(1000, "USD", "en")).toBe("ten US dollars");
    expect(receiptWords(1050, "USD", "en")).toBe("ten US dollars and 50/100");
    expect(receiptWords(1005, "USD", "id")).toBe("sepuluh dolar AS dan 05/100");
  });

  it("refuses amounts that are not whole non-negative numbers", () => {
    expect(() => amountInWords(-1, "id")).toThrow(RangeError);
    expect(() => amountInWords(1.5, "en")).toThrow(RangeError);
    expect(() => amountInWords(Number.MAX_SAFE_INTEGER + 1, "en")).toThrow(RangeError);
  });
});
