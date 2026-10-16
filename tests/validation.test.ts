import { describe, expect, it } from "vitest";
import * as z from "zod";
import { AppError } from "@/lib/errors";
import { parse, stripNul } from "@/lib/validation";

describe("stripNul", () => {
  it("removes NUL from strings at any depth and leaves everything else alone", () => {
    const date = new Date();
    expect(
      stripNul({ a: "x\u0000y", b: ["\u0000", { c: "d\u0000" }], n: 3, d: date, z: null }),
    ).toEqual({
      a: "xy",
      b: ["", { c: "d" }],
      n: 3,
      d: date,
      z: null,
    });
  });
});

describe("parse", () => {
  const schema = z.object({ title: z.string().min(2).max(10) });

  it("validates the cleaned input, so NUL cannot hide a short or long value", () => {
    expect(parse(schema, { title: "ab\u0000" })).toEqual({ title: "ab" });
    expect(() => parse(schema, { title: "\u0000\u0000a" })).toThrow(AppError);
  });

  it("reports the field and the kind of problem", () => {
    try {
      parse(schema, { title: "a" });
      expect.unreachable();
    } catch (e) {
      expect((e as AppError).fields).toEqual({ title: "tooShort" });
    }
  });
});
