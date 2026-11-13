import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  afterEach(() => {
    delete process.env.GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  it("reports the commit the image was built from, without Vercel", async () => {
    process.env.GIT_COMMIT_SHA = "abcdef1234";
    const body = await (await GET()).json();
    expect(body.commit).toBe("abcdef1");
    expect(body.database).toBe(true);
  });

  it("still reads Vercel's commit when only that is set", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "1234567abc";
    expect((await (await GET()).json()).commit).toBe("1234567");
  });
});
