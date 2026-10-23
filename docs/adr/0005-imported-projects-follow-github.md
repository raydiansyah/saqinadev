# 5. Imported projects follow GitHub

Status: accepted (2026-10-23). Risk lane: Red (documents shown to clients, access to a repository).

## Context

A project imported from GitHub is usually an existing system: it may be live, in review or still
being built, and its documents already live in the repository. Two-way document sync (changes go to a
`docs-sync` branch and a pull request) and a generated PRD, plan and task list got in the way: the
repository was written to, and Saqina's own text replaced what the team had.

## Decision

- **GitHub is the only source.** An import turns document sync on in `pull_only` mode
  (`repository_connections.doc_sync_mode`). Saqina reads; it never sends a branch or a pull request.
  Projects that were not imported stay `two_way`.
- **Most recent wins.** When both sides changed, the GitHub commit time of the file is compared with
  the Saqina edit time; the newer text is kept and the other stays in the version history. GitHub is
  read before an edit is saved and when the Documents page is opened (at most every 10 minutes).
- **Everything in the documentation folder is read** (default `docs`, or the folder named at import:
  200 files, 6 levels) and shown. Those documents are approved and shared with the client unless the
  text looks like a secret; files outside the folder (README) stay draft and internal. A pull keeps a
  shared document shared.
- **Nothing is generated.** No PRD, plan or task list is written for an imported project. The PRD is
  found by name anywhere in the folder; when none is found the person chooses a repository file, or
  pastes or uploads one. Tasks come from the repository's own task list or stay empty.
- **How far the system is is asked, not assumed.** After the import the team answers built, reviewed
  and deployed. The answers settle each other, drive the stages, and (with confirmation, forward
  only) move the tasks.

## Consequences

- A client reads what is in the repository, so the repository's docs folder is effectively a client
  deliverable. The import form says so, and secret-looking text is never shared.
- Editing a shared document in Saqina withdraws its approval (existing rule); a pull from GitHub does not.
- Older projects keep `two_way` until someone changes them; the column defaults to it.
- User guides for the team and for clients are signed-in only ([guides](../standards/documentation.md)).
