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
`src/components/landing/`. Sections in order:

- a hero with a 3D scene (`hero.tsx`, `hero-scene.tsx`): the glass stack in `public/landing/hero.webp`
  turns toward the pointer while five document cards float around it;
- the lifecycle (`lifecycle.tsx`): seven steps that advance by themselves while visible, with pause;
- three pillars (`pillars.tsx`): a ring of project parts, a portal preview and a brand preview;
- the five jobs Saqina does (`features.tsx`);
- a receipt preview (`receipt-demo.tsx`): type an amount, record the payment, the receipt appears with
  the amount in words. It runs in the browser and stores nothing;
- a closing call to action (`final-cta.tsx`) over a silent video loop (`public/landing/cta-loop.*`).

The motion classes live in `globals.css` (`intro`, `scene`, `orbit`, `fill-bar`, `data-reveal`) and all
stop under `prefers-reduced-motion`. The two assets are from the first landing and are neutral enough
for the billing story; swap them in `src/content/site/assets.ts`. Copy follows the antislop copywriting rules: plain statements of what the
product does, no numbers or customers that are not real.
