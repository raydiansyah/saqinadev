/**
 * The three-way decision for one linked document. Three hashes describe the history:
 * `remoteSeen` (the file on the base branch when we last looked), `pushed` (what Saqina last
 * sent to the sync branch, possibly still in an open pull request) and the two current sides.
 * Our own push must never come back as a "remote change", and a change on both sides must
 * never be resolved by overwriting one of them.
 */

export type SyncAction =
  /** Nothing to do. */
  | "none"
  /** Saqina changed, the repository did not: send it to the sync branch. */
  | "push"
  /** The repository changed, Saqina did not: save a new Saqina version. */
  | "pull"
  /** Both sides changed to the same text: just record it. */
  | "adopt"
  /** Pull-only, both sides changed: whichever was written last wins (the engine compares times). */
  | "newest"
  /** Both changed differently: keep both and ask. */
  | "conflict"
  /** The file was deleted in the repository: keep the document and ask. */
  | "remote_missing";

export interface SyncInput {
  /** Hash of the document as the repository would store it. */
  local: string;
  /** Hash of the file on the base branch now; null when the file does not exist. */
  remote: string | null;
  remoteSeen: string | null;
  pushed: string | null;
}

export interface SyncDecision {
  action: SyncAction;
  /** The base branch now holds what we pushed: the pull request was merged. */
  merged: boolean;
}

export function decide(input: SyncInput, options: { pullOnly?: boolean } = {}): SyncDecision {
  const { local, remote, pushed } = input;
  const merged = remote !== null && pushed !== null && remote === pushed;
  // After a merge the repository caught up with Saqina; that is not a change by someone else.
  const remoteSeen = merged ? remote : input.remoteSeen;

  if (remote === null && remoteSeen !== null) return { action: "remote_missing", merged };

  const remoteChanged = remote !== remoteSeen;

  // GitHub is the only source: nothing is ever sent. When the repository moved, it is taken unless
  // Saqina holds a different text, and then the more recent of the two wins ("newest").
  if (options.pullOnly) {
    if (!remoteChanged) return { action: "none", merged };
    if (local === remote) return { action: "adopt", merged };
    const localAhead = remoteSeen === null || local !== remoteSeen;
    return { action: localAhead ? "newest" : "pull", merged };
  }

  if (!remoteChanged) {
    // Only Saqina may have moved: send it unless that exact text is already on the sync branch.
    const lastSent = pushed ?? remoteSeen;
    const needsPush = lastSent === null || local !== lastSent;
    return { action: needsPush ? "push" : "none", merged };
  }

  // The repository moved. It is safe to take only if Saqina holds nothing the base branch has
  // not seen: text sitting in an open pull request counts as Saqina's own unmerged change.
  const localAhead = remoteSeen === null || local !== remoteSeen;
  if (!localAhead) return { action: "pull", merged };
  return { action: local === remote ? "adopt" : "conflict", merged };
}
