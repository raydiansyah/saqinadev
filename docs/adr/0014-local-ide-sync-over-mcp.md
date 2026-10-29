# 14. Local IDE agents stay in step over MCP

Status: accepted (2026-10-29). Risk lane: Red (agent access to tasks and tools).

## Context

A developer can build a Saqina project in their own IDE with their own model. That work has to show up
in Saqina, and the agent should have the same skills and connectors as Saqina's own agents.

## Decision

- **Extend the existing per-project MCP server** (bearer tokens, scopes within the agent's own
  permissions). New tools: `list_tasks`, `read_task`, `claim_task`, `report_task_result`, `list_skills`,
  `get_skill`, `list_connector_tools`, `call_connector_tool`, `get_setup`. New scopes: `write_tasks`,
  `use_mcp_tools` (and `read_repository` is selectable in the UI).
- **A task can be claimed and reported as review or blocked, never done.** Completing is a person's act:
  merging the pull request or approving it in Saqina.
- **Connector tools keep their policy.** `call_connector_tool` runs through the same executor: risk,
  agent permission, audit and approval apply; a high-risk tool becomes a proposal and the agent is told so.
- **Resources.** `AGENTS.md`, each skill and the context files the token allows (the same permission
  filter and secret scrubbing as the tools).
- **Code travels by Git.** There is no CLI and no second sync channel: the IDE pushes to GitHub, the
  webhook (ADR 0012) links it to the task.
- Setup snippets for Claude Code, Cursor, Codex and Kiro are shown in settings, with an AGENTS.md download.

## Consequences

- An agent with a stale token loses access when its creator leaves the project (unchanged).
- Skills are text the agent follows as a method; nothing in them runs in Saqina.
