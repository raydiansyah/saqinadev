import { describe, expect, it } from "vitest";
import { type FailedCheck, repairRequest } from "@/lib/executions/repair";

const failed = (over: Partial<FailedCheck> = {}): FailedCheck => ({
  source: "build",
  key: "vercel:dpl_1",
  name: "Preview build",
  url: "https://x.vercel.app",
  ...over,
});

describe("repairRequest", () => {
  it("names what failed, the branch, and the log lines", () => {
    const text = repairRequest("saqina/exec-1234", failed(), [
      "Error: Cannot find module 'leaflet'",
    ]);
    expect(text).toContain(
      'Fix the failed preview build "Preview build" on branch saqina/exec-1234',
    );
    expect(text).toContain("Cannot find module 'leaflet'");
    expect(text).toContain("Do not add features");
  });

  it("says so when there is no log, and calls a CI run a check", () => {
    const text = repairRequest("b", failed({ source: "ci", name: "build-and-test" }), []);
    expect(text).toContain('failed check "build-and-test"');
    expect(text).toContain("No log is available");
  });

  it("scrubs secrets from the log and stays inside the request limit", () => {
    const secret = ["sk", "live", "0123456789abcdefghij0123"].join("_");
    const text = repairRequest("b", failed(), [`token=${secret}`, "x".repeat(10_000)]);
    expect(text).not.toContain(secret);
    expect(text.length).toBeLessThanOrEqual(3900);
  });
});
