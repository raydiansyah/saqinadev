# UI, UX, accessibility and mobile

## Design system (Enforced by review)

- One set of components: `src/components/ui` (button, form fields, notices), `src/components/primitives`,
  `src/components/app/states.tsx`. Tokens live in `src/app/globals.css`. Do not add a second style
  system or one-off colours; extend the tokens.
- Motion has a reason: an entrance, a state change, feedback. Nothing loops without a cause, and every
  animation has a `prefers-reduced-motion` fallback (see the existing blocks in `globals.css`).

## Mobile first (Manual until E2E lands, then Enforced)

- Design at 320 px first, then 768 px, then 1024 px and up. No horizontal scroll at any width.
- Touch targets at least 44 × 44 px (`min-h-11`), with space between neighbours.
- Images: `next/image`, lazy by default, sized, modern formats. No layout shift while loading.
- Check on a real phone before a screen is called done; a resized desktop browser is not enough.

## Every async operation has three states

| State | Requirement |
|---|---|
| Loading | `loading.tsx` or a skeleton that keeps the layout, so nothing jumps |
| Empty | `EmptyState` with what to do next, not a blank page |
| Error | A message in the user's language that says what happened and what to try; the reference id for unexpected errors (`REQ-XXXX`) |

Also handle: slow networks (disable the button while pending, show progress), and double submits.

## Accessibility: WCAG 2.1 AA (Planned automated check, Manual review now)

- Semantic HTML first (`button`, `a`, `nav`, headings in order); ARIA only to fill a real gap.
- Every control has an accessible name; icon-only buttons have `aria-label` or `sr-only` text.
- Keyboard: everything reachable and operable; visible focus; dialogs trap and return focus
  (`components/app/dialog.tsx` does).
- Contrast at least 4.5:1 for text, 3:1 for large text and UI parts. Colour is never the only signal.
- Dynamic updates use `role="status"`/`aria-live`; forms link errors with `aria-describedby`.
- Lighthouse Accessibility ≥ 90 on key pages (see [performance.md](performance.md)).

## Forms

- Client-side validation for quick feedback; **the server validates again** with zod and is the one
  that decides. Never rely on `required`/`maxLength` alone.
- Error text is specific ("at least 5 characters"), tied to the field, and translated.

## Language

English and Indonesian ship together. A new string is added to both files in the same change.
Dates and times use `LocalTime` (visitor's timezone); money uses the helpers in `src/lib/money.ts`.
