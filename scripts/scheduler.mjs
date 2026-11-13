// The VPS scheduler (docs/adr/0028-host-on-a-vps-with-docker.md): calls Saqina's cron routes on their
// schedules. It imports nothing outside node:*, so the slim image runs it.
//
//   CRON_SECRET=… SCHEDULER_TARGET=http://web:3000 node scripts/scheduler.mjs

import { pathToFileURL } from "node:url";

/** Times are UTC, the same as vercel.json had them. */
export const JOBS = [
  { name: "reminders", path: "/api/cron/reminders", at: { hour: 1, minute: 0 } },
  { name: "maintenance", path: "/api/cron/maintenance", at: { hour: 1, minute: 30 } },
];

const TICK_MS = 15_000;
// The longest route works for 240 s; give it room, then give up on that call.
const CALL_TIMEOUT_MS = 300_000;

/**
 * The jobs due in the UTC minute of `now` that have not run in that minute and are not still running.
 * @param {Date} now
 * @param {Map<string, number>} lastRun job name -> the minute (ms / 60 000) it last started
 * @param {Set<string>} running
 * @returns {string[]}
 */
export function dueJobs(now, lastRun, running) {
  const minute = Math.floor(now.getTime() / 60_000);
  return JOBS.filter(({ name, at }) => {
    if (running.has(name) || lastRun.get(name) === minute) return false;
    return at.everyMinute || (now.getUTCHours() === at.hour && now.getUTCMinutes() === at.minute);
  }).map((job) => job.name);
}

async function call(target, secret, job) {
  const started = Date.now();
  let status;
  try {
    const response = await fetch(target + job.path, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    await response.body?.cancel();
    status = response.status;
  } catch (error) {
    status = error instanceof Error ? error.name : "error";
  }
  console.log(JSON.stringify({ job: job.name, status, ms: Date.now() - started }));
}

function main() {
  const secret = process.env.CRON_SECRET;
  const target = (process.env.SCHEDULER_TARGET ?? "http://web:3000").replace(/\/$/, "");
  if (!secret) {
    console.error("CRON_SECRET is not set");
    process.exit(1);
  }
  const lastRun = new Map();
  const running = new Set();
  const tick = () => {
    const now = new Date();
    for (const name of dueJobs(now, lastRun, running)) {
      const job = JOBS.find((j) => j.name === name);
      lastRun.set(name, Math.floor(now.getTime() / 60_000));
      running.add(name);
      call(target, secret, job).finally(() => running.delete(name));
    }
  };
  tick();
  setInterval(tick, TICK_MS);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
