# 9. Platform skills and connectors

Status: accepted (2026-10-29). Risk lane: Red (secrets, outside tools, prompts, every project).

## Context

The platform owner wants to set up skills (working methods such as Superpowers) and connectors (MCP
servers such as Firecrawl, Exa, Context7, or a custom one) once, and have every project use them.
Projects already had their own MCP connections and a memory-based `skills` table; neither is shared.

## Decision

- **Skills are text.** `platform_skills` stores a SKILL.md (front matter `name` and `description`, then
  instructions). Nothing in a skill is executed; installing from GitHub fetches one raw SKILL.md from
  github.com or raw.githubusercontent.com only, with a time, size and rate limit.
- **Built-in skills live in code.** Superpowers `brainstorming` and `writing-plans` are copied verbatim
  (MIT, licence kept beside them) into `src/lib/skills/builtin`. Their rows only record whether they
  are on. They can be switched off, not removed.
- **Trust boundary.** Built-in skills go to the model as instructions; installed skills go as outside
  data that cannot override rules or permissions. Each skill says where it is used (agent runs,
  assistant answers, PRD generation, plan generation).
- **Connectors reuse MCP connections.** `mcp_connections` gains `scope` (`project` or `platform`); a
  platform row has no project. Keys go to the encrypted credential store with platform scope. The
  connector's tool list is kept on the row; each project gets its own `tools` rows on first use, so
  a project admin can still switch a tool off and every run is audited against the project.
- **Off by default when risky.** A tool that says it is read-only starts on; anything else waits for
  the owner. Policy is unchanged: high-risk tools need an approved proposal in the project. Agents
  may read only through enabled low-risk connector tools.
- Presets connect over streamable HTTP with a Bearer key (checked against each vendor's README in
  October 2026). A custom server may also put the key in the URL (`{apiKey}`), filled in only at
  call time.

## Consequences

- Switching a connector off stops its tools in every project at once; removing it revokes the key
  and deletes every project's copy of its tools.
- A skill text is visible to the owner as plain text and is never rendered as HTML.
- Updating Superpowers means copying the new SKILL.md files in whole and noting the commit.
