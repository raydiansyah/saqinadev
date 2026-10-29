# 12. Git, CI and deployments flow back into Saqina

Status: accepted (2026-10-29). Risk lane: Red (webhooks, repository access, task status).

## Context

Work reaches a project from two sides: Saqina's own agents (Studio) and a developer's local IDE agent
with their own model. Both end in the same Git repository, then CI/CD and Vercel. Saqina must stay in
step with all of it. Until now it recorded only pushes that touched documents, and the webhook was set
up by hand.

## Decision

- **One webhook, installed by Saqina.** Connecting a repository installs the hook with the project's
  token (events: push, pull request, check suite, workflow run, deployment status). A token without
  admin rights falls back to showing the URL and a secret once. The hook is signed per connection and
  replay-protected, as before; it serves repository events always and document sync when switched on.
- **Task references link code to tasks.** `T-` plus the first eight characters of the task id, in the
  branch name, pull request or commit. Saqina's agents, `AGENTS.md` and the MCP tools all use the same
  convention, so work from either side is linked the same way.
- **What moves a task.** An opened pull request moves a task to review; a merged one completes it. The
  merge is a person's decision on GitHub, so this is not a model acting alone (PRD A3). A pull request
  closed without merging only records the state. Nothing moves a task backwards.
- **CI and deployments are evidence, not answers.** Runs and deployments are stored as reported. The
  delivery page suggests build (green CI on the default branch), review (a merged pull request) and
  deploy (a successful production deployment) with a one-click confirm; the answers stay the team's
  (ADR 0008).
- A push to the default branch refreshes the head and queues a code reindex.

## Consequences

- Recording is best effort: a failure is logged and acknowledged so GitHub does not retry forever; the
  daily sweep and the next event catch up.
- Only GitHub is wired; other hosts keep the manual path.
