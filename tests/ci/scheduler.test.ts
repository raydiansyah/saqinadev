import { describe, expect, it } from "vitest";
import { dueJobs, JOBS } from "../../scripts/scheduler.mjs";

const at = (iso: string) => new Date(iso);
const minuteOf = (iso: string) => Math.floor(at(iso).getTime() / 60_000);

describe("scheduler", () => {
  it("calls the two cron routes of v1", () => {
    expect(JOBS.map((j) => [j.name, j.path])).toEqual([
      ["reminders", "/api/cron/reminders"],
      ["maintenance", "/api/cron/maintenance"],
    ]);
  });

  it("runs each daily job at its UTC time and nothing in between", () => {
    expect(dueJobs(at("2026-11-10T01:00:05Z"), new Map(), new Set())).toEqual(["reminders"]);
    expect(dueJobs(at("2026-11-10T01:30:20Z"), new Map(), new Set())).toEqual(["maintenance"]);
    expect(dueJobs(at("2026-11-10T13:37:00Z"), new Map(), new Set())).toEqual([]);
  });

  it("runs a job once in its minute", () => {
    const last = new Map([["maintenance", minuteOf("2026-11-10T01:30:00Z")]]);
    expect(dueJobs(at("2026-11-10T01:30:45Z"), last, new Set())).toEqual([]);
  });

  it("skips a job that is still running", () => {
    expect(dueJobs(at("2026-11-10T01:30:00Z"), new Map(), new Set(["maintenance"]))).toEqual([]);
  });
});
