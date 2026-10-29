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
