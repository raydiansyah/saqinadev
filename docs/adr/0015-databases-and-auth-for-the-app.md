# 15. Databases and sign-in for the app: the user's own, with a preview of their own

Status: accepted (2026-10-29). Risk lane: Red (secrets, data access, deploy).

## Context

Apps built in Saqina often need a database or sign-in (Neon, Supabase, Clerk). The preview must keep
working in Saqina, and a preview must never write to real data.

## Decision

- **Always the user's own accounts.** Saqina provides, creates and hosts no database or sign-in. It
  keeps the user's keys, encrypted, for that one project and sends them to that project's deployment.
  Not a platform connector: any project admin (`project:update`) manages it; the platform owner does not.
- **Keys are write-only.** One sealed credential per service (`credentials`, kind `service`, project
  scope) holds `{production, preview}` values. `project_services` holds only names and which are
  filled. A value is never returned to the browser, put in a prompt, an audit event, a log or AGENTS.md
  (which lists variable names only). `withSecret` refuses a credential from another project.
- **Preview has its own values.** Each variable has a Live and a Preview value. A database variable
  must differ between them; Clerk keys in the preview must be test keys. The rule is a pure function
  (`services/preview-ready.ts`).
- **Publish is blocked until the preview is ready.** `publish` refuses with `previewNotReady` before
  any call to Vercel; the Preview tab shows what is missing instead of a broken frame. Values are sent
  with Vercel's env API (`target` production or preview; secrets as `sensitive`) before the deployment
  starts, and again when a service changes on a project that is already published.
- No calls to Neon, Supabase or Clerk: Saqina does not create branches for the user. They make a
  preview branch or project themselves; the runbook explains how.

## Consequences

- A project with no service is unaffected.
- An app that works only with live data cannot be previewed: that is the intended refusal.
- Removing a service revokes its keys; the Vercel variables stay until the next sync replaces them.
