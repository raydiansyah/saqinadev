# 0016. Licence exceptions for Mermaid's dependencies

- Status: accepted
- Date: 2026-10-29

## Context

Mermaid (diagrams in Markdown documents) pulls in two production packages that the licence check
(`pnpm check:licenses`) does not accept as they are declared. The check failed in CI on the security job.

## Decisions

1. **`khroma` (declared "Unknown"): accepted.** Its `package.json` has no `license` field, but the
   package ships a `license` file with the MIT text (Fabio Spampinato, Andrew Maney). It is permissive.
2. **`elkjs` (EPL-2.0): accepted.** The Eclipse Public License 2.0 is a weak, file-level copyleft: only
   changes to `elkjs` files must be shared. We use it unmodified, as a library loaded by Mermaid for graph
   layout, so the obligations are to keep its notice. If we ever patch `elkjs`, share the patch, or drop
   Mermaid's ELK layout.

## Consequences

- CI passes without weakening the rule for anything else; another non-allowed licence still fails.
- Both are listed in `APPROVED_EXCEPTIONS` with this ADR number; a test checks the ADR file exists.
