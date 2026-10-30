# 22. Agents are defined once for the platform by an Owner, frozen per execution

Status: accepted (2026-10-30). Risk lane: Red (permissions, schema, `src/lib/agents`).

## Context

Project agents were five fixed role templates. The Owner needs to say who each agent is, what it may
do, which model and tools it uses, and to add or switch off kinds of agents, without a deploy and
without a project being able to widen its own agents' rights.

## Decision

- **A definition is platform-wide** (`agent_definitions`): identity, instructions, responsibilities,
  scope, forbidden work, definition of done, model, tool list, permissions, handoff targets, attempts,
  time limit, priority and a status (on, off, archived). Only a platform Owner reads or changes it,
  checked in the service on every call.
- **Every save is a version** with a full copy (`agent_definition_versions`) and an audit event that
  names the changed fields and never the instruction text. Saving the same content is not a version.
- **A project's agent follows one definition** (`agents.definition_id`); the five template agents are
  adopted, not duplicated. Their permissions come from the definition (minus anything forbidden).
- **An execution freezes the definitions it started with.** Later edits apply to new executions only.
  Switching a definition off still stops new work at once: assignment checks the live status, so a
  task for an off agent is blocked with the reason instead of running.
- **Hard limits cannot be configured away:** the forbidden permissions and tools (merge, deploy,
  delete) are refused when a definition is saved, and `agentCan` refuses them again when used.
- **Nine presets** are written once (Planner, Architect, Backend, Frontend, Database, QA, Code Reviewer,
  DevOps, Docs). They are data: the Owner can change, switch off or archive any of them, and an
  archived preset is not written back.
- **The Owner sees counts, not content.** The registry shows runs, finished and failed per agent across
  all projects. Messages, files and tasks of a client's project are visible to that project's members
  in their Studio, and not to a platform Owner who is not a member: the PRD's success measure of no
  cross-project or cross-client data stays true.
- A definition's own model, when set, is tried before the role's mapping, within the platform policy
  (`allowAgentOverride`).

## Consequences

- The role vocabulary widens (architect, database, reviewer, devops, custom); the model mapping screen
  lists the new roles.
- A platform with no definitions writes the presets the first time a project needs a team.
- Switching off the only agent of a role makes plans that name it fail with a reason the person can act
  on (switch it on again), rather than start work that cannot be done.
