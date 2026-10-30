<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## PRD and plan workflow (required)

When you create or edit a PRD, spec or plan (implementation plan, roadmap, task breakdown), read `docs/PRD.md` first, then in this order:

1. Superpowers `brainstorming` (and `executing-plans` when running an existing plan).
2. Ruflo `sparc-spec` for a PRD or spec, `goal-plan` for a plan. Search memory for earlier patterns, store what worked.
3. Superpowers `writing-plans`.
4. Load `antislop` and `antislop-copywriting` before writing the text; add `antislop-ui` or `antislop-code` for UI or code.

If a skill is missing, stop and tell the person; do not skip it quietly. Check with
`bash scripts/check-agent-skills.sh`. Details: `docs/standards/ai-agents.md`.

Memory: Ruflo memory holds working patterns only, never client data, secrets or `.env` values. Client-project facts go to Saqina memory as a reviewed candidate (`write_memory`). See `docs/standards/ai-agents.md`.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `.claude/skills/antislop/SKILL.md` (core) and then the skill for the task:
- UI / visual: `.claude/skills/antislop-ui/SKILL.md`
- Copy & text: `.claude/skills/antislop-copywriting/SKILL.md`
- People: `.claude/skills/antislop-human/SKILL.md`
- Mobile / responsive: `.claude/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `.claude/skills/antislop-code/SKILL.md`
This project's antislop mode is DURING (the project owner's choice): apply the rules while writing, without asking for the mode. A session instruction from the person still wins. Say `antislop active: during (project default).` once, before the first edit (or at the start of the final answer for read-only work).
To update antislop, follow `.claude/skills/ANTISLOP-SOURCE.md`.
<!-- antislop:end -->
