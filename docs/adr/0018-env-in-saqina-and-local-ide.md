# 18. The same env in Saqina and in a local IDE

Status: accepted (2026-10-29). Risk lane: Red (secrets leaving Saqina to a developer's machine).

## Context

A project is built in Saqina (agents, preview on Vercel) or in a local IDE with the developer's own
model, or both. The app must start in all three places: live, Saqina's preview and a developer's
machine. Until now Saqina knew Live and Preview values only, and a variable added in a local IDE stayed
unknown to Saqina until the preview failed.

## Decision

- **One list of names, three values.** Every service variable has Live, Preview and an optional
  Local value. Local falls back to Preview and may never be the live database or a live Clerk key
  (same rule as Preview).
- **Saqina to the deployment:** Live and Preview as before; the effective Local value goes to Vercel's
  `development` target as an encrypted variable (Vercel does not allow sensitive ones there), so
  `vercel env pull` works on a client's own Vercel.
- **Saqina to a developer's machine:** `.env.example` (names only) for any project member; `.env.local`
  (Local values, never live) for project admins only, rate limited, audited with names only. IDE
  agents get names only (AGENTS.md, MCP); values never go into a model's context through Saqina.
- **A developer's machine back to Saqina:** Saqina reads the repository's `.env.example` and warns
  about a name it does not know (the preview would fail) and lists names it has that the file lacks.
  This is a warning, not a block: `.env.example` may list optional variables.

## Consequences

- A developer who downloads `.env.local` holds working keys on their machine; the audit log shows who
  and when. Rotating means entering a new value in Saqina and downloading again.
- Platform-provided names (`NODE_ENV`, `VERCEL_*`, `PORT`, `CI`) are never asked for.
- A repository without `.env.example` gets no comparison; AGENTS.md asks agents to keep one.
