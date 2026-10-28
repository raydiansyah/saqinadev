@AGENTS.md
@docs/standards/README.md

## PRD and plan workflow (required)

When you create or edit a PRD, spec or plan, read `docs/PRD.md` first, then in this order:

1. Superpowers `brainstorming` (and `executing-plans` when running an existing plan).
2. Ruflo `sparc-spec` for a PRD or spec, `goal-plan` for a plan. Search memory for earlier patterns, store what worked.
3. Superpowers `writing-plans`.
4. Load `antislop` and `antislop-copywriting` before writing the text; add `antislop-ui` or `antislop-code` for UI or code.

If a skill is missing, stop and tell the person; do not skip it quietly. Check with
`bash scripts/check-agent-skills.sh`. Details: `docs/standards/ai-agents.md`.

No `Co-Authored-By` trailer on commits or pull requests in this project.

Memory: Ruflo memory holds working patterns only, never client data, secrets or `.env` values. Client-project facts go to Saqina memory as a reviewed candidate (`write_memory`). See `docs/standards/ai-agents.md`.
