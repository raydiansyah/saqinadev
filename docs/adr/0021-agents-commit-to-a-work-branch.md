# 21. Agents commit to their own work branch without approval; nothing else changes without one

Status: accepted (2026-10-30). Risk lane: Red (tools, permissions, git).

## Context

PRD A3 and S3 said a model never writes, merges or deploys alone and that every agent result is a
proposal a person approves. With that rule Build cannot start work by itself: each task waits for a
person, which is the "press a button on every agent" flow the Studio is meant to remove. The owner
decided that agents may commit automatically to a branch of their own, as long as merging and
publishing stay with a person.

## Decision

- An execution has **one work branch** (`<agent prefix>exec-<8 characters>`, `saqina/exec-…` by
  default), made from the repository's base branch on the first commit.
- **A commit to that branch is allowed without approval, and nothing else is.** The rule is a pure
  function (`isWorkBranchCall`) used by the tool policy: the call is `commit_changes` to the
  execution's own branch (or creating it), the agent's permissions include `write_branch`, and the
  tool is on the list frozen for the agent. Committing to any other branch, opening a pull request and
  every other high-risk tool stay proposals. `merge_branch` and the `deploy`, `git_push` and
  `delete_project` permissions stay refused, and the registry will not store them on a definition.
- **The tool list is frozen per execution.** A tool outside the agent's list is denied, even a read.
- **Writes are checked before any commit, all or nothing:** every path inside the task's target paths
  (a task with none cannot write), no secrets file, no `.git`, no dependencies folder, no key file, no
  content that looks like a secret, at most 12 files and 300 KB. Success means the host returned a
  commit id; only then are file and commit artifacts recorded, and an identical commit that already
  succeeded is never repeated.
- The audit row of a commit keeps the branch, message, paths and sizes, not the file contents.
- Reviewers (QA and Code Reviewer) do not write. A verdict needs evidence for every criterion; a failed
  one becomes a bounded revision task.
- Anything the agent reads (files, other agents' work, messages, CI output) goes to the model as
  outside data, never as instructions. The agents' own instructions come only from the Owner's
  definition.

## Consequences

- PRD A3 and S3 change: code on a work branch needs no approval; merging, opening a pull request,
  publishing and every change to project data (tasks, documents, requirements) still do.
- A person reviews the branch (Code, Git) and merges it on the host; Saqina never merges (S6 is unchanged).
- A wrong commit is contained to one branch that can be deleted. The cost is a branch per execution on
  the repository.
- CI on the work branch (through repository events) is the only test result Saqina reports; it does not
  run tests itself.
