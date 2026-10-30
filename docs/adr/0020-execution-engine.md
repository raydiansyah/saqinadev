# 20. The execution engine: a database queue and a stored event log, no new infrastructure

Status: accepted (2026-10-30). Risk lane: Red (agents, `src/app/api/**`, migrations).

## Context

Plan and Build must run work that takes minutes (a model plans, agents write code) and must show
what is happening in the browser as it happens, after a reload and after a dropped connection.
Saqina runs on Vercel functions with PostgreSQL. It has no queue service, no worker process and no
realtime service, and the PRD says a model never acts alone (A3). The first request must not wait
for the work.

## Decision

- **State lives in the database, and the browser holds a copy.** An execution has tasks, task
  dependencies, runs (one per attempt), agent messages, artifacts and an ordered event log. The event
  number is taken from the execution row in the same transaction as the change, so a reader that saw
  event N has seen every event before it. The browser keeps the server's snapshot; events only tell it
  when to ask again. An older snapshot never replaces a newer one.
- **Work is queued in a table** (`execution_jobs`: plan, dispatch, run a task), claimed with
  `FOR UPDATE SKIP LOCKED`, with a lock that expires so a dead worker's job is taken over. A step asked
  for twice queues one job (an idempotency key built from the execution's event number).
- **The queue is worked in two places**: after the response that started it (`after()`, with
  `maxDuration` 300 on the Studio page), and by `GET /api/cron/executions` for what that missed. An open
  event stream also starts a drain when a job is due. The same code runs in both, so they can run
  side by side.
- **Realtime is server-sent events read from the stored log**, not a socket. A connection lasts about
  50 seconds and ends with `end` when the execution is final; the browser reconnects with
  `Last-Event-ID` and gets exactly what it missed. If the stream keeps failing, the browser polls the
  snapshot every few seconds.
- **State machines are pure and checked on every move** (`executions/state.ts`): execution and task
  moves outside the table are a CONFLICT, final states are never left, and every move is a conditional
  update, so two workers cannot both win.
- **Limits are part of an execution** (its budget): 25 tasks, a chain of 6 dependent tasks, 2 retries
  per task, 3 runs at once, 60 minutes, 400 messages, and 3 open executions per project.
- **A time limit is enforced by the runner**, not left to the agent: the agent is told to stop (abort
  signal) and the runner stops waiting for it either way. A result that arrives after a stop is
  dropped, except that a commit that really happened is still recorded.

## Alternatives

- Redis with BullMQ, Inngest or another queue: a new service, new credentials and a second place where
  the truth could differ from the database. Not needed at this size; the table has the same shape and
  can move to one later.
- WebSockets or a hosted realtime service: needs a long-lived connection or another vendor. Server-sent
  events over the stored log work on the existing deployment and make reconnection a database read.
- Keeping state only in the browser or only in memory: lost on reload, and not auditable.

## Consequences

- On Vercel's Hobby plan cron is daily, so a job a worker missed waits until a viewer opens the
  execution or the next call; production should call the cron route every minute (Pro) or from an
  outside scheduler (see the runbook).
- A function that is cut at `maxDuration` leaves a job locked for up to 6 minutes; the next drain takes
  it over and counts that attempt as failed.
- Polling the log from an open stream costs one indexed query a second per viewer, for at most 50
  seconds at a time.
- The event log is append-only and is the record of what happened; it carries no secrets (scrubbed and
  clipped) and no file contents.
