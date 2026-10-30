# 19. antislop as the default anti-slop rules, in the repository and in the product

Status: accepted (2026-10-29). Risk lane: Yellow (prompt content and size; no data or permission change).

## Context

The project owner chose antislop (<https://github.com/miqdadbadjuber/anti-slop>, MIT, release 3.2.24)
as the default rules against generic AI output: for the AI tools that work on this repository, and for
the agents and generators inside Saqina. `AGENTS.md` already required it for PRD and plan text, but no
tool here had it installed.

## Decision

- **In the repository:** the six skill folders are copied unchanged into `.claude/skills/antislop*`
  (source commit in `.claude/skills/ANTISLOP-SOURCE.md`). A pointer block at the end of `AGENTS.md`
  tells every tool where they are and sets the mode to DURING, so no session asks.
  `scripts/check-agent-skills.sh` counts the repository folder.
- **In the product:** the same texts are built-in skills (`src/lib/skills/builtin/antislop/`), next to
  Superpowers. A line after each front matter fixes the mode to DURING; the core leaves out its
  install wizard and mode question, which cannot run inside Saqina. Uses: core and copywriting for PRD
  and plan generation and agent runs; UI, people, mobile layout and code comments for agent runs. The
  owner can switch any of them off. They are not added to every chat reply (a person can still pick
  them as context).
- **Prompt budget:** built-in skills may be up to 50 000 characters each (the core is about 46 000) and
  all skills together up to 100 000; installed skills stay capped at 20 000 each.

## Consequences

- PRD and plan generation and agent runs send more text to the model (up to roughly 25 000 tokens of
  skills). Switching a skill off removes its share.
- antislop's Python contrast checker is vendored with its skill for repository tools only; Saqina never
  runs it.
- Updating means copying a new release over both copies and the source note, never editing the text.
