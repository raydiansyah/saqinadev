# 0002. Licence exceptions

- Status: accepted
- Date: 2026-10-16

## Context

The dependency licence check (`pnpm check:licenses`, part of CI) allows permissive licences only
(see docs/standards/delivery.md). Two production packages fall outside the list.

## Decisions

1. **`@img/sharp-libvips-*` (LGPL-3.0-or-later): accepted.** It is the prebuilt libvips that Next.js'
   image optimisation loads through `sharp`. It is dynamically linked, unmodified and not distributed
   by us as part of a product binary: Vercel installs it per platform. The LGPL obligations (keep the
   notice, allow replacing the library) hold. If Saqina is ever shipped as an installable product,
   revisit this.
2. **`gsap` (GSAP "no charge" licence): temporary.** The licence permits free commercial use, with a
   restriction against building a competing visual animation tool. Nothing imports it today (the only
   reference was `src/lib/motion/load-gsap.ts`, removed with this decision). **Remove the dependency**
   with `pnpm remove gsap`, then delete the `gsap` entry from `APPROVED_EXCEPTIONS` in
   `scripts/lib-rules.ts`. If animation needs it later, add it back through a new ADR and a lazy import.

## Consequences

- CI passes today without weakening the rule for anything else; a new non-allowed licence still fails.
- Each exception names its ADR in `APPROVED_EXCEPTIONS`; a test checks that the ADR file exists.
