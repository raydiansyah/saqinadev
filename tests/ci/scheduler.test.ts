import { describe, expect, it } from "vitest";
import { dueJobs, JOBS } from "../../scripts/scheduler.mjs";

const at = (iso: string) => new Date(iso);
const minuteOf = (iso: string) => Math.floor(at(iso).getTime() / 60_000);

describe("scheduler", () => {
  it("keeps the schedules Vercel had, with executions every minute", () => {
    expect(JOBS.map((j) => [j.name, j.path])).toEqual([
      ["executions", "/api/cron/executions"],
      ["reminders", "/api/cron/reminders"],
      ["maintenance", "/api/cron/maintenance"],
      ["doc-sync", "/api/cron/doc-sync"],
    ]);
  });

  it("runs executions every minute and each daily job at its UTC time", () => {
    expect(dueJobs(at("2026-11-10T01:30:20Z"), new Map(), new Set())).toEqual([
      "executions",
      "maintenance",
    ]);
    expect(dueJobs(at("2026-11-10T01:00:05Z"), new Map(), new Set())).toEqual([
      "executions",
      "reminders",
    ]);
    expect(dueJobs(at("2026-11-10T02:00:59Z"), new Map(), new Set())).toEqual([
      "executions",
      "doc-sync",
    ]);
    expect(dueJobs(at("2026-11-10T13:37:00Z"), new Map(), new Set())).toEqual(["executions"]);
  });

  it("runs a job once in its minute", () => {
    const last = new Map([
      ["executions", minuteOf("2026-11-10T01:30:00Z")],
      ["maintenance", minuteOf("2026-11-10T01:30:00Z")],
    ]);
    expect(dueJobs(at("2026-11-10T01:30:45Z"), last, new Set())).toEqual([]);
  });

  it("skips a job that is still running", () => {
    expect(dueJobs(at("2026-11-10T01:31:00Z"), new Map(), new Set(["executions"]))).toEqual([]);
  });
});
