# 29. Agent harness: runners on the owner's machines run the official CLIs; Saqina orchestrates

Status: proposed (2026-11-10). Risk lane: Red (shell execution on the owner's machines, device tokens,
agent autonomy). Design: [agent harness spec](../superpowers/specs/2026-11-10-agent-harness-design.md).

## Context

- Saqina's agents call a model and return file edits ([ADR 0021](0021-agents-commit-to-a-work-branch.md)).
  They cannot run a build or a test, so failures surface only on Vercel or in CI
  ([ADR 0026](0026-repair-failed-builds.md)).
- The owner works across several models, devices and VMs and wants one control screen for coding-agent
  sessions on all of them.
- Subscription logins (Claude, ChatGPT) may only be used through the official CLI on the owner's own
  machine ([ADR 0023](0023-local-cli-provider.md)).
- Frameworks were compared on 2026-11-10: LangChain/LangGraph, Langflow, CrewAI, AutoGen and Mastra. Each
  supplies an agent loop with tools and its own checkpoint store. Saqina already has the work-level part:
  - task graph;
  - Postgres queue with `SKIP LOCKED`;
  - state machines;
  - event log;
  - approvals;
  - frozen definitions.

  The official CLIs supply a better agent loop than one Saqina would write.

## Decision

- **Two layers.**
  - Saqina keeps the work-level orchestration: plan, tasks, routing, budgets, approvals and events.
  - The agent loop runs inside the official CLI (Claude Code first, then Codex and Kiro) on the owner's
    machines.
  - No LangChain or LangGraph. Revisit only if Saqina must run tool-using agents on the server without a
    CLI.
- **Runner.** `saqina-runner` is a service on each machine:
  - it is paired with a one-time code and holds a revocable device token, stored only as a hash;
  - it connects outbound over HTTPS through Tailscale, with long-poll for commands and batched,
    sequence-numbered events;
  - it reports its inventory: CLIs, versions, account labels and free disk;
  - it runs each session in its own git worktree under the allowed roots.
- **Accounts stay on the machine.** Each CLI account has its own config folder on the machine. Saqina
  stores a label, never a token, and never extracts or proxies subscription credentials.
- **Executor `runner`.**
  - An agent definition can choose `executor: runner`, with a preferred CLI, model and machine.
  - The dispatcher picks an online machine that has that CLI, an account not reported as exhausted, and
    the repository.
  - Otherwise it uses the fallback in the definition, or blocks the task with the reason.
  - The session is keyed `run:<runId>:<attempt>`, so a restarted worker reattaches to the session instead
    of starting a second one.
- **Success rule unchanged.** A task succeeds only when its commit is visible on the work branch at the
  repository host. Builds and tests the CLI ran are stored as runner-reported results, separate from CI.
- **Limits.**
  - Push only to the session's branch: a `pre-push` hook in the worktree, plus branch protection on the
    host. Branch protection is the real guarantee and is required by the runbook.
  - A browser terminal is out of scope; use SSH over Tailscale.
  - Everything is Owner-only; anyone else gets NOT_FOUND.
- **Manual sessions.** The cockpit can start a session without a plan. It uses the same runner path,
  events and limits.

## Consequences

- Agents can build and run tests on a real machine, which removes PRD non-goal "agents that run tests
  themselves" for runner tasks.
- Work depends on the owner's machines being online. A missing machine blocks the task with a reason and
  does not fail silently.
- Switching CLI mid-task starts a new session with a handover (branch, summary, changed files). Sessions
  are not portable between vendors.
- The runner is new code that runs on the owner's machines with shell access. It needs its own tests, a
  release process and an update path.
- Subscription quota appears only if the CLI reports it. Saqina does not estimate it.
