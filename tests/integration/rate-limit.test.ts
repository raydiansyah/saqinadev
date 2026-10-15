import { beforeEach, describe, expect, it } from "vitest";
import { allow } from "@/lib/rate-limit";
import { resetDatabase } from "../helpers/db";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("shared rate limiter", () => {
  beforeEach(resetDatabase);

  it("allows up to the limit, then refuses", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await allow("t:basic", 3, 60_000));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("keeps keys independent", async () => {
    expect(await allow("t:a", 1, 60_000)).toBe(true);
    expect(await allow("t:a", 1, 60_000)).toBe(false);
    expect(await allow("t:b", 1, 60_000)).toBe(true);
  });

  it("starts a new window once the old one expires", async () => {
    expect(await allow("t:window", 1, 80)).toBe(true);
    expect(await allow("t:window", 1, 80)).toBe(false);
    await sleep(120);
    expect(await allow("t:window", 1, 80)).toBe(true);
  });

  it("counts atomically under concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => allow("t:race", 5, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
