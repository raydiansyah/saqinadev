# 26. A failed build or check on finished work is repaired once more, in a bounded way

Status: accepted (2026-11-06). Risk lane: Red (starts agent work without a person pressing a button; migration 0041).

## Context

The agents write code to a work branch and a person merges it. Whether it builds is only known when
Vercel builds the preview or CI runs, after the agents have stopped. A broken preview then waited for a
person to notice and ask again, so an app made from an idea could sit broken.

## Decision

- **A failure is news.** When a preview build (deployment) or a CI run on a branch fails, and that
  branch is the work branch of an execution that has **succeeded**, `requestRepair` queues one `repair`
  job for it, keyed by the execution and the failed build or run so a repeated webhook queues nothing new.
- **The job starts a follow-up execution on the same branch** (`startExecution` with a server-only
  `parentExecutionId` and `branch`), as the person who started the original, so their access is checked
  again. The planner is told it is a repair: the smallest change, one or two tasks, no new features. The
  request carries the failure: for a Vercel build, the last error lines of the build log, with secrets
  scrubbed; for CI, the check's name and link.
- **Bounded.** At most two repairs per original execution, one at a time, and only for finished work.
  Anything else ends with a visible `repair.skipped` note (budget, one already running, no owner, too many
  open executions, no active agent) or with nothing at all (another branch, a passing build, work still
  running, where the agents' own review sees CI).
- **Same branch.** The planner keeps a branch the execution was started with, so the fix lands where the
  failed build is and the next preview builds the fixed code.
- **Nothing is claimed that did not happen.** The agents still do not run the build or the tests. Vercel
  and CI do, and their result is what starts or ends the loop.

## Consequences

- A person who started an execution may find a follow-up in their chat that they did not type; it is
  named as a fix of a failed build and its first words say so.
- Without a Vercel target or a log, the request says no log is available and the agents work from the
  code. This is weaker than with a log.
- The loop costs model calls. Two rounds is the ceiling per original execution.
