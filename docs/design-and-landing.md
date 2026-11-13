# Design and landing page

Saqina's own look and the public landing page.

## 1. Saqina's own look

Defined once as CSS variables in `src/app/globals.css` (Tailwind 4 `@theme inline`). Components use the
tokens, never raw colours.

| Token | Value | Use |
|---|---|---|
| `--background` | `oklch(0.165 0.006 50)` | Page, warm graphite |
| `--surface`, `--surface-raised` | `oklch(0.2 …)`, `oklch(0.232 …)` | Cards and panels |
| `--foreground` | `oklch(0.965 0.004 70)` | Text |
| `--primary` | `oklch(0.71 0.18 32)`, coral `#FF6A55` | The main action and focus ring |
| `--success`, `--info`, `--warning`, `--error` | green, blue, amber, red | Status only, never decoration |

- One scheme: dark. `color-scheme: dark`; there is no light mode.
- Fonts: Geist and Geist Mono (`next/font/google`, set in `src/app/[locale]/layout.tsx`).
- Green stays separate from the coral brand colour so "paid" and "done" never read as branding.
- A client portal can be branded within limits ([white label](standards/white-label.md)).
- Rules for interface work: [UI and UX standard](standards/ui-ux.md) and the antislop skills.

## 2. The public landing page (saqina.dev)

`src/app/[locale]/(marketing)/page.tsx`, text in `src/content/site/{en,id}.ts`, parts in
`src/components/landing/`. Three sections: a hero (`hero.tsx`), the five jobs Saqina does
(`features.tsx`) and a closing call to action (`final-cta.tsx`). There is no hero image and no motion
beyond the scroll reveal. Copy follows the antislop copywriting rules: plain statements of what the
product does, no numbers or customers that are not real.
